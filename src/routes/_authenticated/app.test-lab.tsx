import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { getMe } from "@/lib/auth.functions";
import { canAccessPath } from "@/lib/nav/modes";

export const Route = createFileRoute("/_authenticated/app/test-lab")({
  head: () => ({
    meta: [
      { title: "Test Lab — MikroTik Magic" },
      {
        name: "description",
        content:
          "Use a spare physical MikroTik. Every write is gated. MCP access is a policy checklist — it never talks to hardware.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestLabLayout,
});

const TABS = [
  { to: "/app/test-lab/real", label: "Real routers", hint: "Owner or admin only" },
  { to: "/app/test-lab/mcp", label: "MCP access", hint: "Owner or admin only" },
] as const;

function TestLabLayout() {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 5 * 60_000 });
  const roles = me.data?.roles ?? [];
  const tabs = TABS.filter((tab) => canAccessPath(roles, tab.to));

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.label("Test Lab")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t.copy(
            "Use a spare physical MikroTik. Every write is gated. MCP access is a policy checklist — it never talks to hardware.",
          )}
        </p>
      </header>

      <nav
        aria-label={t.label("Router environment")}
        className="flex flex-wrap gap-2 rounded-2xl border border-[color:var(--glass-border)] p-2"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl px-4 py-2 text-center text-sm ${
                active
                  ? "bg-[color:var(--glass-border)] font-semibold"
                  : "text-muted-foreground hover:bg-[color:var(--glass-border)]/40"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[11px] opacity-70">{t.copy(tab.hint)}</span>
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
