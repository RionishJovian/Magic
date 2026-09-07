import { useState } from "react";
import type { Script } from "@/data/scripts";
import { copyText } from "@/lib/browser/clipboard";

export function ScriptCard({ script }: { script: Script }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const copy = async () => {
    const ok = await copyText(script.code);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="panel interactive-card overflow-hidden hover:border-primary/40">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="chip text-primary">{script.category}</span>
            <span className="chip">RouterOS {script.routerOS}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
            {script.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{script.description}</p>
        </div>
        <button
          onClick={copy}
          className="shrink-0 self-start rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:text-primary active:scale-[0.98]"
          aria-label={`Copy ${script.title}`}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </header>

      <div className="relative">
        <pre
          className={`m-0 overflow-x-auto p-5 text-[12.5px] leading-relaxed text-foreground/90 ${
            open ? "max-h-[640px]" : "max-h-56"
          } transition-[max-height] duration-300`}
          style={{ background: "oklch(0.13 0.02 250)" }}
        >
          <code>{script.code}</code>
        </pre>
        {!open && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
            style={{
              background: "linear-gradient(to bottom, transparent, oklch(0.13 0.02 250))",
            }}
          />
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
        <div className="flex flex-wrap gap-1.5">
          {script.tags.map((t) => (
            <span key={t} className="chip text-[0.68rem]">
              #{t}
            </span>
          ))}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {open ? "Collapse" : "Expand full script"}
        </button>
      </footer>
    </article>
  );
}
