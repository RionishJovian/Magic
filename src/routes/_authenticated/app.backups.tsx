import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listDbBackups, runDbBackupNow, signDbBackup } from "@/lib/backups.functions";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/backups")({
  head: () => ({
    meta: [
      { title: "Database Backups — MikroTik Magic" },
      {
        name: "description",
        content:
          "Developer-only automated database snapshots. Daily JSON backups stored privately with signed download links.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackupsPage,
});

function fmtBytes(n: number) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function BackupsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDbBackups);
  const runNow = useServerFn(runDbBackupNow);
  const sign = useServerFn(signDbBackup);

  const list = useQuery({
    queryKey: ["db-backups"],
    queryFn: () => fetchList(),
  });

  const runMut = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r) => {
      toast.success(`Backup created (${fmtBytes(r?.bytes ?? 0)})`);
      qc.invalidateQueries({ queryKey: ["db-backups"] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  async function download(path: string) {
    try {
      const { url } = await sign({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Database backups</h1>
          <p className="text-sm text-muted-foreground">
            Automated daily JSON snapshots of your app tables, stored privately in the{" "}
            <code>db-backups</code> bucket. Retained for 30 days. Developer / platform admin only.
          </p>
        </div>
        <button
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {runMut.isPending ? "Running…" : "Run backup now"}
        </button>
      </header>

      <section className="glass-panel rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent snapshots
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Created</th>
                <th className="py-1 pr-2">Path</th>
                <th className="py-1 pr-2">Size</th>
                <th className="py-1 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((f) => (
                <tr key={f.path} className="border-t border-border/40">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {f.created_at ? new Date(f.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-1 pr-2 font-mono">{f.path}</td>
                  <td className="py-1 pr-2">{fmtBytes(f.size)}</td>
                  <td className="py-1 pr-2 text-right">
                    <button
                      onClick={() => download(f.path)}
                      className="rounded border border-border/60 px-2 py-0.5 hover:bg-white/5"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
              {list.isLoading && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (list.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-muted-foreground">
                    No backups yet. Click "Run backup now" or wait for the daily cron.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-4 text-sm text-muted-foreground">
        <h2 className="mb-2 font-semibold text-foreground">Schedule</h2>
        <p>
          A daily cron runs at <strong>03:15 UTC</strong> and uploads a JSON snapshot containing
          every app table (profiles, routers, sites, vouchers, sales, syslog, terminal history, and
          more). Older files past 30 days are pruned automatically.
        </p>
      </section>
    </div>
  );
}
