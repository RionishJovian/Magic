import type { WebfigLauncher } from "@/lib/webfig";
import { LockKeyhole } from "lucide-react";

export function WebfigButton({
  launcher,
  name,
}: {
  launcher: WebfigLauncher | null | undefined;
  name: string;
}) {
  if (!launcher) return null;
  if (!launcher.url) {
    const locked = launcher.locked;
    return (
      <span
        className={`webfig-btn cursor-not-allowed ${locked ? "webfig-btn-locked" : "opacity-50"}`}
        title={launcher.reason ?? "WebFig is not available"}
        aria-disabled="true"
      >
        {locked && <LockKeyhole className="size-3" aria-hidden />}
        WebFig {locked && <span className="webfig-lock-label">LOCKED</span>}
      </span>
    );
  }
  return (
    <a
      href={launcher.url}
      target="_blank"
      rel="noreferrer noopener"
      className="webfig-btn"
      title={launcher.reason ?? `Open WebFig for ${name} in a new tab`}
      aria-label={`Open WebFig for ${name} in a new tab`}
    >
      WebFig <span aria-hidden>↗</span>
    </a>
  );
}
