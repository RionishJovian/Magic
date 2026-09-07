import { useEffect, useState } from "react";
import { isStandaloneDisplay, needsLegacyHomeScreenHint } from "@/lib/browser/platform";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Home-screen install hint. Hides itself when the app is already running
 * standalone (installed) or once the user accepts the prompt.
 *
 * Chrome/Edge/Samsung fire `beforeinstallprompt`. iOS WebKit never does, but
 * it uniquely exposes `navigator.standalone` — that capability check drives
 * the Share → Add to Home Screen copy (no user-agent sniffing).
 */
export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [legacyHint, setLegacyHint] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setLegacyHint(needsLegacyHomeScreenHint());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && !legacyHint) return null;

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Add MikroTik Magic to your home screen</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {legacyHint && !deferred
              ? "In Safari, tap Share then “Add to Home Screen” to open the dashboard like a native app."
              : "Install the app for a full-screen, native-feeling dashboard with its own icon."}
          </p>
        </div>
        {deferred && (
          <button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === "accepted") setInstalled(true);
              setDeferred(null);
            }}
            className="rounded-full border border-primary/50 bg-primary/15 px-4 py-2 text-xs font-medium text-primary backdrop-blur-xl transition hover:bg-primary/25 active:scale-95"
          >
            Install app
          </button>
        )}
      </div>
    </section>
  );
}
