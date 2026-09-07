import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { TestLabPrivilegedGate } from "@/components/TestLabPrivilegedGate";
import {
  MCP_AUTH_NOTES,
  MCP_DISABLED_WRITE_TOOLS,
  MCP_READ_ONLY_TOOLS,
  MCP_WRITE_PREREQUISITES,
} from "@/lib/mcp/policy";

export const Route = createFileRoute("/_authenticated/app/test-lab/mcp")({
  head: () => ({
    meta: [
      { title: "MCP access policy — MikroTik Magic" },
      {
        name: "description",
        content:
          "Exactly which read-only MCP tools are exposed, how OAuth and tenant authorization apply, and why write tools stay disabled.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: McpPolicyGuarded,
});

function McpPolicyGuarded() {
  return (
    <TestLabPrivilegedGate>
      <McpPolicyPage />
    </TestLabPrivilegedGate>
  );
}

function McpPolicyPage() {
  const t = useT();
  return (
    <div className="grid gap-6">
      <section
        role="note"
        className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm"
      >
        <div className="text-base font-semibold text-emerald-300">
          {t.label("MCP is read-only")}
        </div>
        <p className="mt-1 text-muted-foreground">
          {t.copy(
            "An AI assistant connected over MCP can look at your network. It cannot change it: no tool exposed today creates, disconnects, blocks or deletes anything.",
          )}
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Exposed tools")}</h2>
        <ul className="mt-3 grid gap-2">
          {MCP_READ_ONLY_TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="rounded-xl border border-[color:var(--glass-border)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all text-xs">{tool.name}</code>
                <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300">
                  {t.label("Read-only")}
                </span>
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {t.copy(tool.description)}
              </p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {t.copy(tool.reads)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Authorization")}</h2>
        <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          {MCP_AUTH_NOTES.map((n) => (
            <li key={n}>{t.copy(n)}</li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Disabled write tools")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.copy(
            "These exist in the source code but are not registered with the MCP server and do not appear in its manifest, so no client can call them.",
          )}
        </p>
        <ul className="mt-3 grid gap-2">
          {MCP_DISABLED_WRITE_TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="rounded-xl border border-[color:var(--glass-border)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all text-xs line-through">{tool.name}</code>
                <span className="rounded-full border border-red-500/40 px-2 py-0.5 text-[11px] text-red-300">
                  {t.label("Disabled")}
                </span>
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">{t.copy(tool.why)}</p>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">
          {t.label("Required before any write tool is enabled")}
        </h3>
        <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          {MCP_WRITE_PREREQUISITES.map((p) => (
            <li key={p}>{t.copy(p)}</li>
          ))}
        </ul>
      </section>

      <Link
        to="/app/manual"
        className="inline-flex min-h-11 w-fit items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
      >
        Back to the user manual
      </Link>
    </div>
  );
}
