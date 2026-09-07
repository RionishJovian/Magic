/**
 * @vitest-environment jsdom
 */
/**
 * End-to-end coverage for the "AI scan error" button in the router audit log.
 *
 * Two layers:
 *  1. UI  — render the button, click it, assert the rendered panel shows the
 *           cause, the fix steps and the RouterOS command.
 *  2. AI  — run the real diagnosis code path (prompt building, gateway request,
 *           JSON parsing, normalization) against recorded gateway fixtures via a
 *           mocked `fetch`, so results are deterministic. Set RUN_LIVE_AI=1 to
 *           hit the real gateway instead when re-recording the fixtures.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AiDiagnosis } from "@/components/AiDiagnosis";
import { diagnoseAuditError, type AuditDiagnosis } from "@/lib/audit-diagnosis";
import { CONNECTION_ROW, QUOTA_ROW, gatewayResponse, replayGateway } from "./fixtures/ai-diagnosis";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => {
    throw new Error("server fn not available in tests");
  },
}));
vi.mock("@/lib/routers.functions", () => ({
  explainRouterAuditError: () => Promise.resolve(null),
}));

afterEach(() => cleanup());

function renderButton(explain: (id: string) => Promise<AuditDiagnosis>) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AiDiagnosis id="00000000-0000-0000-0000-000000000001" explain={explain} />
    </QueryClientProvider>,
  );
}

describe("AI scan error button (UI)", () => {
  it("renders cause, fix steps and the RouterOS command after a click", async () => {
    const user = userEvent.setup();
    const explain = vi.fn(async () => ({
      summary: "The RouterOS www-ssl service is disabled, so the REST API refuses connections.",
      steps: ["Enable the www-ssl service", "Allow TCP 443 from the app IP"],
      command: "/ip service enable www-ssl",
    }));

    renderButton(explain);
    await user.click(screen.getByRole("button", { name: "AI scan error" }));

    await waitFor(() => expect(screen.getByTestId("ai-diagnosis")).toBeTruthy());
    expect(explain).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001");
    expect(screen.getByTestId("ai-summary").textContent).toContain("www-ssl");
    expect(screen.getByTestId("ai-steps").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByTestId("ai-command").textContent).toBe("/ip service enable www-ssl");
    expect(screen.getByRole("button", { name: "Hide AI fix" })).toBeTruthy();
  });

  it("omits the command block when the fix is app-side only (quota)", async () => {
    const user = userEvent.setup();
    renderButton(async () => ({
      summary: "The tenant already uses its single-router plan allowance.",
      steps: ["Upgrade to a Plus tier", "Or delete an unused router"],
      command: null,
    }));

    await user.click(screen.getByRole("button", { name: "AI scan error" }));
    await waitFor(() => expect(screen.getByTestId("ai-diagnosis")).toBeTruthy());
    expect(screen.queryByTestId("ai-command")).toBeNull();
    expect(screen.getByTestId("ai-steps").textContent).toContain("Plus");
  });

  it("surfaces gateway errors instead of a blank panel", async () => {
    const user = userEvent.setup();
    renderButton(async () => {
      throw new Error("AI credits exhausted for this workspace.");
    });

    await user.click(screen.getByRole("button", { name: "AI scan error" }));
    await waitFor(() =>
      expect(screen.getByText("AI credits exhausted for this workspace.")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ai-diagnosis")).toBeNull();
  });
});

const KEY = process.env["LOVABLE_API_KEY"];
const LIVE = process.env["RUN_LIVE_AI"] === "1" && Boolean(KEY);
const TEST_KEY = KEY ?? "test-key";

describe(`AI scan error (${LIVE ? "live gateway" : "recorded fixtures"})`, () => {
  beforeEach(() => {
    if (LIVE) return;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = typeof init?.body === "string" ? init.body : "";
      return replayGateway(body);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("diagnoses a device-quota failure with an app-side remedy", async () => {
    const out = await diagnoseAuditError(QUOTA_ROW, TEST_KEY);
    expect(out.summary.length).toBeGreaterThan(10);
    expect(out.summary.toLowerCase()).toMatch(/quota|limit|plan|allow/);
    expect(out.steps.length).toBeGreaterThanOrEqual(1);
    // A quota failure is not fixable on the router: either no command, or a
    // syntactically valid RouterOS line if the model still suggests one.
    if (out.command !== null) expect(out.command.trim().startsWith("/")).toBe(true);
  });

  it("diagnoses a connection failure with a RouterOS command", async () => {
    const out = await diagnoseAuditError(CONNECTION_ROW, TEST_KEY);
    expect(out.summary.length).toBeGreaterThan(10);
    expect(out.summary.toLowerCase()).toMatch(/refus|service|firewall|port|reach|api|connect/);
    expect(out.steps.length).toBeGreaterThanOrEqual(2);
    expect(out.command).toBeTruthy();
    expect(out.command!.trim().startsWith("/")).toBe(true);
    expect(out.command!.toLowerCase()).toMatch(/ip service|firewall|www-ssl|certificate/);
  });
});

describe("AI diagnosis error handling (mocked gateway)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps 429 to a rate-limit message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }));
    await expect(diagnoseAuditError(QUOTA_ROW, TEST_KEY)).rejects.toThrow(/rate limit/i);
  });

  it("maps 402 to a credits message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 402 }));
    await expect(diagnoseAuditError(QUOTA_ROW, TEST_KEY)).rejects.toThrow(/credits/i);
  });

  it("falls back to raw text when the model returns non-JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const out = await diagnoseAuditError(QUOTA_ROW, TEST_KEY);
    expect(out.summary).toBe("not json at all");
    expect(out.steps).toEqual([]);
    expect(out.command).toBeNull();
  });

  it("normalizes a blank command to null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      gatewayResponse({
        summary: "Quota reached on this plan.",
        steps: ["Upgrade"],
        command: "   ",
      }),
    );
    const out = await diagnoseAuditError(QUOTA_ROW, TEST_KEY);
    expect(out.command).toBeNull();
  });
});
