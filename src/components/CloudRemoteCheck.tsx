import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { probeWanExposure } from "@/lib/mikrotik.functions";
import { useT } from "@/lib/i18n";

type Props = {
  /** Called with the detected Cloud DDNS hostname so the parent form can use it. */
  onDetected: (ddnsName: string) => void;
  /** Called when the line turns out to be CGNAT and Cloud Remote can't work. */
  onCgnat?: () => void;
  defaultUsername?: string;
};

/**
 * "Check this line" — verifies from the cloud whether a public/DDNS host can
 * host Cloud Remote, or whether the site needs Magic Hub or Local Connector.
 * Never dials RFC1918 LAN addresses from the server.
 */
export function CloudRemoteCheck({ onDetected, onCgnat, defaultUsername = "admin" }: Props) {
  const t = useT();
  const probe = useServerFn(probeWanExposure);
  const [publicHost, setPublicHost] = useState("");
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("");

  const run = useMutation({
    mutationFn: () =>
      probe({
        data: {
          host: publicHost.trim(),
          port: 443,
          username: username.trim(),
          password,
          useTls: true,
          restPort: 443,
        },
      }),
    onSuccess: (res) => {
      if (res.ok && res.ddnsName) onDetected(res.ddnsName);
      if (!res.ok && res.verdict === "cgnat") onCgnat?.();
    },
  });

  const res = run.data;
  const badge = (() => {
    if (!res) return null;
    if (res.ok) {
      return {
        tone: "border-success/50 bg-success/10 text-success",
        title: t.label("Public IP — Cloud Remote works"),
      };
    }
    if (res.verdict === "cgnat") {
      return {
        tone: "border-warning/50 bg-warning/10 text-warning",
        title: t.label("CGNAT detected — use Magic Hub or Local Connector"),
      };
    }
    if (res.verdict === "port-closed") {
      return {
        tone: "border-warning/50 bg-warning/10 text-warning",
        title: t.label("Port 443 unreachable — fix firewall / port forward"),
      };
    }
    if (res.verdict === "no-ddns") {
      return {
        tone: "border-warning/50 bg-warning/10 text-warning",
        title: t.label("Cloud DDNS not active yet"),
      };
    }
    return {
      tone: "border-danger/50 bg-danger/10 text-danger",
      title: t.label("Router not reachable"),
    };
  })();

  return (
    <div className="rounded-xl border border-[color:var(--glass-border)] bg-white/5 p-3">
      <div className="text-xs font-medium">{t.label("Check this line")}</div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {t.copy(
          "Runs from the cloud against a public WAN IP or Cloud DDNS hostname (not a LAN IP). Reads Cloud DDNS and tests whether the internet can reach the router. Starlink and mobile ISPs are usually CGNAT — those sites need Magic Hub or Local Connector.",
        )}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input
          className="input"
          placeholder="abc123.sn.mynetname.net"
          aria-label="Public host or Cloud DDNS"
          value={publicHost}
          onChange={(e) => setPublicHost(e.target.value)}
        />
        <input
          className="input"
          placeholder="API username"
          aria-label="API username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="API password"
          aria-label="API password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="mt-2 min-h-[36px] rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/25 disabled:opacity-60"
        disabled={run.isPending || !publicHost.trim() || !password}
        onClick={() => run.mutate()}
      >
        {run.isPending ? "Checking…" : "Check this line"}
      </button>

      {run.error && <p className="mt-2 text-[11px] text-danger">{(run.error as Error).message}</p>}

      {res && badge && (
        <div className={`mt-3 space-y-1 rounded-lg border p-2 text-[11px] ${badge.tone}`}>
          <div className="font-medium">{badge.title}</div>
          <div className="text-muted-foreground">
            {res.ddnsName && (
              <div className="break-all">
                {t.label("Cloud DDNS")}: <code>{res.ddnsName}</code>
              </div>
            )}
            {"wanAddress" in res && res.wanAddress && (
              <div className="break-all">
                {t.label("WAN address")}: <code>{res.wanAddress}</code>
              </div>
            )}
            {"cloudPublicAddress" in res && res.cloudPublicAddress && (
              <div className="break-all">
                {t.label("Public address")}: <code>{res.cloudPublicAddress}</code>
              </div>
            )}
            {res.error && <div className="mt-1 break-words">{res.error}</div>}
            {res.ok && (
              <div className="mt-1">
                {t.copy("Hostname filled in above — add the router to finish.")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
