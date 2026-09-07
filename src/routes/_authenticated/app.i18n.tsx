import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { i18nReport } from "@/lib/i18n/report.generated";
import type { I18nEntryRef, I18nLanguageReport } from "@/lib/i18n/report-types";
import { LANGUAGES, useT } from "@/lib/i18n";
import I18N_RULES_MD from "@/content/i18n-rules.md?raw";

export const Route = createFileRoute("/_authenticated/app/i18n")({
  head: () => ({
    meta: [
      { title: "Language coverage — MikroTik Magic" },
      {
        name: "description",
        content:
          "Internal language health: translation coverage, untranslated strings and Burmese rule violations across MikroTik Magic.",
      },
      { property: "og:title", content: "Language coverage — MikroTik Magic" },
      {
        property: "og:description",
        content: "Internal translation coverage and rule checks for MikroTik Magic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: I18nPage,
});

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, `${l.label} (${l.native})`]),
);

const btnCls =
  "rounded-full border border-[color:var(--glass-border)] bg-white/10 px-4 py-2 text-xs font-medium backdrop-blur-xl transition hover:border-primary/60 hover:text-primary active:scale-95 disabled:opacity-50";

function Bar({ pct }: { pct: number }) {
  const tone = pct >= 100 ? "bg-emerald-400" : pct >= 80 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function EntryList({ title, rows }: { title: string; rows: I18nEntryRef[] }) {
  if (!rows.length) return null;
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({rows.length})
      </h4>
      <ul className="mt-2 space-y-1 text-xs">
        {rows.map((r) => (
          <li
            key={`${r.ns}:${r.key}`}
            className="rounded-lg border border-[color:var(--glass-border)] bg-white/5 px-3 py-2"
          >
            <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase">
              {r.ns}
            </span>
            {r.key}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LanguageCard({ code, r }: { code: string; r: I18nLanguageReport }) {
  const [showUnused, setShowUnused] = useState(false);
  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{LANG_LABEL[code] ?? code}</h2>
        <span className="text-xs text-muted-foreground">
          {r.translated}/{r.total} · {r.coverage}%
        </span>
      </div>
      <div className="mt-3">
        <Bar pct={r.coverage} />
      </div>
      {code === "my" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Navigation, feature titles and descriptions are translated. Action buttons, brand words
          and RouterOS commands stay in English by design.
        </p>
      )}

      <EntryList title="Untranslated" rows={r.missing} />
      <EntryList title="Placeholder (TODO)" rows={r.todo} />
      <EntryList title="Wrong script" rows={r.wrongScript} />

      {r.actionEntries.length > 0 && (
        <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          Rule violation — action buttons must stay English: {r.actionEntries.join(", ")}
        </p>
      )}

      {r.unused.length > 0 && (
        <div className="mt-4">
          <button type="button" className={btnCls} onClick={() => setShowUnused((v) => !v)}>
            {showUnused ? "Hide" : "Show"} pre-translated, not on screen ({r.unused.length})
          </button>
          {showUnused && <EntryList title="Not rendered anywhere" rows={r.unused} />}
        </div>
      )}
    </section>
  );
}

function buildMarkdown() {
  const lines = [
    "# MikroTik Magic — language coverage report",
    "",
    `Report generated at build time: ${i18nReport.generatedAt}`,
    `Downloaded: ${new Date().toISOString()}`,
    "",
    `Source strings: ${i18nReport.sourceCounts.ui} ui · ${i18nReport.sourceCounts.copy} copy`,
    "",
  ];
  for (const [code, r] of Object.entries(i18nReport.languages)) {
    lines.push(`## ${LANG_LABEL[code] ?? code} — ${r.translated}/${r.total} (${r.coverage}%)`, "");
    const section = (title: string, rows: I18nEntryRef[]) => {
      if (!rows.length) return;
      lines.push(`### ${title} (${rows.length})`, "");
      for (const row of rows) lines.push(`- [ ] ${row.ns}: ${row.key}`);
      lines.push("");
    };
    section("Untranslated", r.missing);
    section("Placeholder (TODO)", r.todo);
    section("Wrong script", r.wrongScript);
    section("Pre-translated, not rendered", r.unused);
    if (r.actionEntries.length)
      lines.push(
        `### Action-button rule violations`,
        "",
        ...r.actionEntries.map((k: string) => `- ${k}`),
        "",
      );
  }
  if (i18nReport.violations.length) {
    lines.push("## Rule violations", "");
    for (const v of i18nReport.violations) lines.push(`- [${v.lang}] ${v.rule}: ${v.detail}`);
    lines.push("");
  }
  return lines.join("\n");
}

function I18nPage() {
  const t = useT();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 5 * 60_000 });
  const roles = me.data?.roles ?? [];
  const isStaff = isPrivilegedAccount(roles, me.data?.isPlatformAdmin);
  const [showRules, setShowRules] = useState(false);

  const worstCoverage = useMemo(
    () => Math.min(...Object.values(i18nReport.languages).map((l) => l.coverage)),
    [],
  );

  function download() {
    const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `i18n-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (me.isLoading) {
    return <p className="text-sm text-muted-foreground">{t.copy("Loading…")}</p>;
  }

  if (!isStaff) {
    return (
      <div className="glass-panel rounded-2xl p-6">
        <h1 className="text-lg font-semibold">Language coverage</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This internal page is available to the app owner and admins only.
        </p>
      </div>
    );
  }

  const clean = i18nReport.violations.length === 0 && worstCoverage >= 100;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Language coverage</h1>
          <p className="text-sm text-muted-foreground">
            {t.copy(
              "Translation health for Chinese and Burmese, generated by the build-time audit that also gates CI.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnCls} onClick={() => setShowRules((v) => !v)}>
            {showRules ? "Hide i18n rules" : "View i18n rules"}
          </button>
          <button type="button" className={btnCls} onClick={download}>
            Download report
          </button>
        </div>
      </header>

      {showRules && (
        <section className="glass-panel rounded-2xl p-5">
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {I18N_RULES_MD}
          </pre>
        </section>
      )}

      <section
        className={`glass-panel rounded-2xl p-5 ${clean ? "" : "border-red-400/40"}`}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              clean
                ? "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border border-red-400/40 bg-red-400/10 text-red-200"
            }`}
          >
            {clean ? "All rules pass" : `${i18nReport.violations.length} rule violation(s)`}
          </span>
          <span className="text-muted-foreground">
            Lowest coverage {worstCoverage}% · {i18nReport.sourceCounts.ui} ui ·{" "}
            {i18nReport.sourceCounts.copy} copy strings
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Snapshot taken at build time ({new Date(i18nReport.generatedAt).toLocaleString()}). Run{" "}
          <code className="rounded bg-white/10 px-1">bun run i18n:sync</code> to scaffold missing
          entries and <code className="rounded bg-white/10 px-1">bun run i18n:audit</code> to
          refresh this page.
        </p>
        {i18nReport.violations.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-red-200">
            {i18nReport.violations.map((v, i) => (
              <li key={i}>
                [{v.lang}] {v.rule}: {v.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(i18nReport.languages).map(([code, r]) => (
          <LanguageCard key={code} code={code} r={r} />
        ))}
      </div>
    </div>
  );
}
