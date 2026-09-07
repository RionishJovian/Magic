import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { TestLabPrivilegedGate } from "@/components/TestLabPrivilegedGate";
import { listRoutersByEnvironment } from "@/lib/test-router.functions";
import { TEST_ROUTER_CHECKLIST, expectedConfirmation, BATCH_LIMIT } from "@/lib/test-router";

export const Route = createFileRoute("/_authenticated/app/test-lab/real")({
  head: () => ({
    meta: [
      { title: "Real routers — MikroTik Magic" },
      {
        name: "description",
        content:
          "Register an isolated physical test router, follow the staged checklist, and run a read-only check before any guarded write.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RealRoutersGuarded,
});

function RealRoutersGuarded() {
  return (
    <TestLabPrivilegedGate>
      <RealRoutersPage />
    </TestLabPrivilegedGate>
  );
}

function RealRoutersPage() {
  const t = useT();
  const fetchRouters = useServerFn(listRoutersByEnvironment);
  const routers = useQuery({ queryKey: ["routers-by-environment"], queryFn: () => fetchRouters() });

  const test = routers.data?.test ?? [];
  const production = routers.data?.production ?? [];
  const empty = !routers.isLoading && test.length === 0 && production.length === 0;

  return (
    <div className="grid gap-6">
      <section
        role="note"
        className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm"
      >
        <div className="text-base font-semibold text-red-300">
          {t.label("Real hardware — writes are gated")}
        </div>
        <p className="mt-1 text-muted-foreground">
          {t.copy(
            "Nothing on this page contacts a router by itself. A read-only connection check always runs first, writes happen one router at a time, and each one needs a typed confirmation.",
          )}
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Registered routers")}</h2>
        {routers.isLoading && (
          <p className="mt-2 text-sm text-muted-foreground">{t.copy("Loading…")}</p>
        )}
        {routers.isError && (
          <p className="mt-2 text-sm text-red-300">
            {t.copy("Could not load your routers. Try again in a moment.")}
          </p>
        )}
        {empty && (
          <div className="mt-3 rounded-xl border border-dashed border-[color:var(--glass-border)] p-5 text-center">
            <p className="text-sm font-medium">{t.copy("No routers are registered yet.")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {t.copy(
                "Work through the checklist below first. When your isolated lab router is ready, register it deliberately from the Routers page — it will be created as a test router.",
              )}
            </p>
            <Link
              to="/app/routers"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[color:var(--glass-border)] px-5 text-xs"
            >
              Register a test router
            </Link>
          </div>
        )}
        {!empty && !routers.isLoading && (
          <div className="mt-3 grid gap-4">
            {[
              { title: "Test routers", rows: test, tone: "text-amber-300" },
              { title: "Production routers", rows: production, tone: "text-emerald-300" },
            ].map((group) => (
              <div key={group.title}>
                <h3 className={`text-sm font-semibold ${group.tone}`}>{t.label(group.title)}</h3>
                {group.rows.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t.copy("None.")}</p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {group.rows.map((r) => (
                      <li
                        key={r.id}
                        className="grid gap-1 rounded-xl border border-[color:var(--glass-border)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="break-words text-sm font-medium">{r.name}</div>
                          <div className="break-all text-xs text-muted-foreground">
                            {r.host}:{r.port} · {r.use_tls ? "TLS" : "no TLS"}
                            {r.allow_insecure_tls ? " · self-signed exception" : ""}
                          </div>
                        </div>
                        <Link
                          to="/app/routers"
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
                        >
                          Open router
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Test router setup checklist")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.copy("Every item must be true before the first guarded write.")}
        </p>
        <ol className="mt-3 grid gap-2">
          {TEST_ROUTER_CHECKLIST.map((item, i) => (
            <li
              key={item.id}
              className="rounded-xl border border-[color:var(--glass-border)] p-3 text-sm"
            >
              <div className="break-words font-medium">
                <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                {t.label(item.title)}
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {t.copy(item.detail)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Staged rollout rules")}</h2>
        <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            {t.copy(
              `Test-router actions run against ${BATCH_LIMIT.test} router at a time; production allows at most ${BATCH_LIMIT.production}.`,
            )}
          </li>
          <li>
            {t.copy(
              'Promoting a router to production needs a primary tenant user plus the exact phrase, for example: "',
            )}
            <code className="break-words">
              {expectedConfirmation("promote", "production", "Lab RB")}
            </code>
            {'".'}
          </li>
          <li>
            {t.copy(
              'Publishing a portal to production needs the phrase "DEPLOY PRODUCTION <router name>"; a test router uses "DEPLOY <router name>".',
            )}
          </li>
          <li>
            {t.copy(
              "Connection checks, validation failures, promotions, deploys, rollbacks and failed confirmations are all written to the operations audit — never with secrets.",
            )}
          </li>
        </ul>
        <Link
          to="/app/test-lab/mcp"
          className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
        >
          Read the MCP access policy
        </Link>
      </section>
    </div>
  );
}
