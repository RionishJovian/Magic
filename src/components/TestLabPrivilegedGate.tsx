import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { getTestLabAccess } from "@/lib/test-router.functions";
import { useT } from "@/lib/i18n";

/**
 * Wraps the real-hardware side of the Test Lab. The server is the real gate —
 * every privileged server function checks the role again — this only decides
 * whether to render the page or a clear access-denied message.
 */
export function TestLabPrivilegedGate({ children }: { children: ReactNode }) {
  const t = useT();
  const fetchAccess = useServerFn(getTestLabAccess);
  const access = useQuery({
    queryKey: ["test-lab-access"],
    queryFn: () => fetchAccess(),
    staleTime: 5 * 60_000,
  });

  if (access.isLoading) {
    return <p className="text-sm text-muted-foreground">{t.copy("Checking your access…")}</p>;
  }

  if (access.data?.allowed) return <>{children}</>;

  return (
    <section
      role="note"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm"
    >
      <h2 className="text-base font-semibold text-amber-300">
        {t.label("Owner or admin access required")}
      </h2>
      <p className="mt-1 text-muted-foreground">
        {t.copy(
          "This part of the Test Lab talks to physical hardware, so only the app owner or an admin can open it.",
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/app"
          className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
        >
          Back to Home
        </Link>
        <Link
          to="/app/profile"
          className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
        >
          Contact the app owner
        </Link>
      </div>
    </section>
  );
}
