/**
 * @vitest-environment jsdom
 */
/**
 * Focused coverage for the /auth sign-in flow.
 *
 * Root cause under test: before hydration the submit button must not perform a
 * native GET form submission (that reload wiped the typed credentials and the
 * ?next= target). Plus the regular flows: email login, username login,
 * non-enumerating unknown identifiers, rate-limit surfacing, and failed
 * sign-ins that must not navigate.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
const resolve = vi.fn();
const signIn = vi.fn();
const createTrial = vi.fn();
const getSession = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: { kind?: string }) => (fn?.kind === "trial" ? createTrial : resolve),
}));
vi.mock("@/lib/owner.functions", () => ({ resolveLoginEmail: {} }));
vi.mock("@/lib/trial-signup.functions", () => ({ createTrialAccount: { kind: "trial" } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      signInWithPassword: (args: unknown) => signIn(args),
    },
  },
}));

import { SignInForm } from "@/components/SignInForm";

beforeEach(() => {
  navigate.mockReset();
  resolve.mockReset();
  signIn.mockReset();
  createTrial.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
});
afterEach(cleanup);

async function waitForReady() {
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
}

function renderSignIn(returnTo: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignInForm returnTo={returnTo} />
    </QueryClientProvider>,
  );
}

function renderSignInToString(returnTo: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <SignInForm returnTo={returnTo} />
    </QueryClientProvider>,
  );
}

async function fill(id: string, pw = "hunter2222") {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Username or email"), id);
  await user.type(screen.getByPlaceholderText("Password"), pw);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInForm", () => {
  it("renders the submit control disabled before hydration (no native GET submit)", () => {
    const html = renderSignInToString("/app/access-points");
    expect(html).toContain("disabled");
  });

  it("enables submit once hydrated", async () => {
    renderSignIn("/app");
    await waitForReady();
  });

  it("signs in with an email identifier and navigates to the return target", async () => {
    resolve.mockResolvedValue({ email: "user@example.test" });
    signIn.mockResolvedValue({ error: null });
    renderSignIn("/app/access-points");
    await waitForReady();
    await fill("user@example.test");
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({ email: "user@example.test", password: "hunter2222" }),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/app/access-points", replace: true });
  });

  it("signs in with a username identifier via the resolver", async () => {
    resolve.mockResolvedValue({ email: "resolved@example.test" });
    signIn.mockResolvedValue({ error: null });
    renderSignIn("/app");
    await waitForReady();
    await fill("someuser");
    await waitFor(() => expect(resolve).toHaveBeenCalledWith({ data: { identifier: "someuser" } }));
    expect(signIn).toHaveBeenCalledWith({ email: "resolved@example.test", password: "hunter2222" });
  });

  it("does not enumerate unknown identifiers and does not navigate", async () => {
    resolve.mockResolvedValue({ email: "unknown-account@invalid.local" });
    signIn.mockResolvedValue({ error: new Error("Invalid login credentials") });
    renderSignIn("/app");
    await waitForReady();
    await fill("nobody-here");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid login credentials");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("surfaces the server-side rate limit message", async () => {
    resolve.mockRejectedValue(
      new Error("Too many sign-in attempts. Please wait a minute and try again."),
    );
    renderSignIn("/app");
    await waitForReady();
    await fill("someuser");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many sign-in attempts");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("does not crash when the persisted session is broken", async () => {
    getSession.mockRejectedValue(new Error("Failed to fetch"));
    renderSignIn("/app");
    await waitForReady();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("redirects an already-signed-in visitor to the return target", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    renderSignIn("/app/vouchers");
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app/vouchers", replace: true }),
    );
  });

  it("creates an immediately usable seven-day trial account", async () => {
    createTrial.mockResolvedValue({ ok: true, username: "newcafe" });
    resolve.mockResolvedValue({ email: "newcafe@mikromagic" });
    signIn.mockResolvedValue({ error: null });
    renderSignIn("/app");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Start free trial" }));
    await user.type(screen.getByPlaceholderText("Your name or business name"), "New Cafe");
    await user.type(screen.getByPlaceholderText("Choose a username"), "NewCafe");
    await user.type(screen.getByPlaceholderText("Password"), "magic6");
    await user.type(screen.getByPlaceholderText("Confirm password"), "magic6");
    await user.click(screen.getByRole("button", { name: "Create trial account" }));

    await waitFor(() =>
      expect(createTrial).toHaveBeenCalledWith({
        data: {
          username: "newcafe",
        password: "magic6",
          display_name: "New Cafe",
        },
      }),
    );
    expect(signIn).toHaveBeenCalledWith({ email: "newcafe@mikromagic", password: "magic6" });
    expect(navigate).toHaveBeenCalledWith({ to: "/app", replace: true });
  });

  it("blocks a trial signup when password confirmation differs", async () => {
    renderSignIn("/app");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Start free trial" }));
    await user.type(screen.getByPlaceholderText("Your name or business name"), "New Cafe");
    await user.type(screen.getByPlaceholderText("Choose a username"), "NewCafe");
    await user.type(screen.getByPlaceholderText("Password"), "magic6");
    await user.type(screen.getByPlaceholderText("Confirm password"), "magic7");
    await user.click(screen.getByRole("button", { name: "Create trial account" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Passwords do not match.");
    expect(createTrial).not.toHaveBeenCalled();
  });
});
