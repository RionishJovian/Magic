import { useEffect, useState } from "react";

const KEY = "mm.introSeen";

/**
 * Movie-trailer style title sequence shown once per browser session on the
 * landing page. Skipped entirely for reduced-motion users.
 */
export function CinematicIntro() {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      if (reduced || window.sessionStorage.getItem(KEY)) {
        setPhase("done");
        return;
      }
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      if (reduced) {
        setPhase("done");
        return;
      }
    }
    setPhase("playing");
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => setPhase("done"), 3600);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (phase === "done") document.body.style.overflow = "";
  }, [phase]);

  if (phase !== "playing") return null;

  return (
    <div
      className="intro-overlay"
      role="presentation"
      aria-hidden="true"
      onClick={() => setPhase("done")}
    >
      <div className="intro-bloom" />
      <div className="intro-stage">
        <div className="intro-line intro-line-1">MIKROTIK</div>
        <div className="intro-line intro-line-2">MAGIC</div>
        <div className="intro-rule" />
        <div className="intro-sub">The place where all the magic happens.</div>
      </div>
      <button
        type="button"
        className="intro-skip"
        onClick={() => setPhase("done")}
        aria-label="Skip intro animation"
      >
        Skip
      </button>
    </div>
  );
}
