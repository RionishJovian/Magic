import { BrandSignature } from "@/components/BrandSignature";
import { TelegramCta } from "@/components/TelegramCta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SignInForm } from "@/components/SignInForm";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Admin sign in — MikroTik Hotspot Admin" },
      {
        name: "description",
        content: "Sign in to manage MikroTik hotspot routers, vouchers, and portal design.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safeNext(raw: string): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/app";
}

function AuthPage() {
  const { next } = Route.useSearch();
  const returnTo = safeNext(next ?? "");

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-[max(1rem,calc(env(safe-area-inset-left,0px)+0.75rem))] py-[max(3rem,env(safe-area-inset-top))] pe-[max(1rem,calc(env(safe-area-inset-right,0px)+0.75rem))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      {/* Night orbs */}
      <div
        className="orb pointer-events-none absolute -top-24 -right-24 hidden h-80 w-80 dark:block"
        style={{
          background: "radial-gradient(circle, var(--orb-a) 0%, transparent 65%)",
          opacity: 0.45,
        }}
        aria-hidden="true"
      />
      <div
        className="orb pointer-events-none absolute bottom-0 -left-24 hidden h-72 w-72 dark:block"
        style={{
          background: "radial-gradient(circle, var(--orb-b) 0%, transparent 65%)",
          animationDelay: "-5s",
          opacity: 0.38,
        }}
        aria-hidden="true"
      />
      <div
        className="orb pointer-events-none absolute top-1/2 right-1/4 hidden h-64 w-64 dark:block"
        style={{
          background: "radial-gradient(circle, var(--orb-d, #4a235a) 0%, transparent 65%)",
          animationDelay: "-9s",
          opacity: 0.22,
        }}
        aria-hidden="true"
      />
      <div className="interactive-card panel relative z-10 w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 text-kicker text-xs uppercase tracking-[0.2em]">
            <span>MikroTik Hotspot Admin</span>
            <BrandSignature />
          </div>
          <h1 className="text-title mt-2 text-2xl">
            Sign <span className="gradient-text">in</span>
          </h1>
        </div>
        <SignInForm returnTo={returnTo} />
        <div className="mt-4 flex items-center justify-end text-sub text-xs">
          <Link to="/" className="hover:text-foreground">
            ← Home
          </Link>
        </div>
        <p className="text-sub mt-4 text-xs leading-relaxed">
          Accounts are created by the app developer and agents. If you need access, contact us on
          Telegram.
        </p>
        <TelegramCta
          label="Contact us on Telegram"
          variant="app"
          className="mt-3 w-full justify-center"
        />
      </div>
    </div>
  );
}
