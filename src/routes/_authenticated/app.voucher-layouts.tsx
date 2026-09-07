import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { toErrorMessage } from "@/lib/error-message";
import { DEFAULT_VOUCHER_PRINT_LAYOUT, type VoucherPrintLayout } from "@/lib/voucher-print-layout";
import {
  getVoucherPrintLayout,
  saveVoucherPrintLayout,
} from "@/lib/voucher-print-layout.functions";

const printTestReceipt = createClientOnlyFn(async (layout: VoucherPrintLayout) => {
  const { printVoucherThermalReceipt } = await import("@/lib/voucher-print.client");
  return printVoucherThermalReceipt(
    { code: "DEMO-1234", profile: "Demo plan", priceMmk: 1500, expiresAt: null },
    layout,
  );
});

export const Route = createFileRoute("/_authenticated/app/voucher-layouts")({
  head: () => ({
    meta: [
      { title: "Voucher Print Layouts — MikroTik Hotspot Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VoucherLayoutsPage,
});

export function VoucherLayoutsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const fetchLayout = useServerFn(getVoucherPrintLayout);
  const saveLayout = useServerFn(saveVoucherPrintLayout);
  const layout = useQuery({ queryKey: ["voucher-print-layout"], queryFn: () => fetchLayout() });
  const [draft, setDraft] = useState<VoucherPrintLayout>(DEFAULT_VOUCHER_PRINT_LAYOUT);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (layout.data) setDraft(layout.data);
  }, [layout.data]);
  useEffect(() => {
    if (!draft.show_qr) {
      setQr(null);
      return;
    }
    void QRCode.toDataURL("DEMO-1234", { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [draft.show_qr]);

  const save = useMutation({
    mutationFn: () => saveLayout({ data: draft }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["voucher-print-layout"], saved);
      toast.success("Voucher print layout saved");
    },
    onError: (error) =>
      toast.error(toErrorMessage(error, "Could not save the voucher print layout.")),
  });

  if (layout.isLoading)
    return <div className="panel p-6 text-sm text-muted-foreground">Loading print layout…</div>;
  if (layout.isError)
    return (
      <AccessState
        embedded={embedded}
        message={toErrorMessage(
          layout.error,
          "Voucher print layouts are available to Primary and Developer accounts.",
        )}
      />
    );

  const update = <K extends keyof VoucherPrintLayout>(key: K, value: VoucherPrintLayout[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {!embedded && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Voucher print layouts</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {
                "Configure the owner-facing counter receipt only. These settings do not change the guest captive portal or RouterOS Hotspot configuration."
              }
            </p>
          </div>
          <Link
            to="/app/vouchers"
            className="rounded-md border border-border px-3 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Back to vouchers
          </Link>
        </header>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel space-y-5 p-5">
          <div>
            <h2 className="text-base font-semibold">Default counter receipt</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Applied to every voucher slip and thermal print for this tenant.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <Input
                value={draft.business_name}
                onChange={(event) => update("business_name", event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Wi-Fi name">
              <Input
                value={draft.wifi_name}
                onChange={(event) => update("wifi_name", event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Support contact">
              <Input
                value={draft.support_contact}
                onChange={(event) => update("support_contact", event.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Thermal paper width">
              <select
                value={draft.paper_width_mm}
                onChange={(event) =>
                  update("paper_width_mm", Number(event.target.value) as 58 | 80)
                }
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value={80}>80 mm (standard counter printer)</option>
                <option value={58}>58 mm (compact printer)</option>
              </select>
            </Field>
          </div>
          <Field label="Voucher use terms">
            <textarea
              value={draft.terms}
              onChange={(event) => update("terms", event.target.value)}
              maxLength={600}
              rows={4}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle
              checked={draft.show_qr}
              onChange={(checked) => update("show_qr", checked)}
              label="Include QR code"
            />
            <Toggle
              checked={draft.show_price}
              onChange={(checked) => update("show_price", checked)}
              label="Show price"
            />
            <Toggle
              checked={draft.show_expiry}
              onChange={(checked) => update("show_expiry", checked)}
              label="Show expiry / use terms"
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Save layout"}
            </button>
            <button
              type="button"
              onClick={() => void printTestReceipt(draft)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary"
            >
              Print test receipt
            </button>
          </div>
        </section>

        <aside className="panel p-5">
          <h2 className="text-base font-semibold">Live preview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A receipt preview; the browser print dialog controls the physical printer.
          </p>
          <div className="mx-auto mt-4 max-w-[280px] rounded-lg bg-white p-5 font-mono text-center text-[11px] text-black shadow-lg">
            <b>{draft.business_name}</b>
            <div className="text-[10px] text-neutral-600">Wi-Fi voucher receipt</div>
            <Rule />
            {qr ? (
              <img src={qr} alt="Preview voucher QR code" className="mx-auto h-28 w-28" />
            ) : null}
            <div className="my-2 text-xl font-extrabold tracking-wider">DEMO-1234</div>
            <div className="text-left leading-5">
              Plan: Demo plan
              {draft.show_price ? (
                <>
                  <br />
                  Price: 1,500 MMK
                </>
              ) : null}
              <br />
              Wi-Fi: {draft.wifi_name}
              {draft.show_expiry ? (
                <>
                  <br />
                  Expiry: Starts when first used
                </>
              ) : null}
              <br />
              Support: {draft.support_contact}
            </div>
            <Rule />
            <div className="text-[10px] text-neutral-600">{draft.terms}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}
function Rule() {
  return <div className="my-3 border-t border-dashed border-black" />;
}
function AccessState({ message, embedded = false }: { message: string; embedded?: boolean }) {
  return (
    <div className="panel mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold">Voucher print layouts</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        to={embedded ? "/app/easy/vouchers" : "/app/vouchers"}
        className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {embedded ? "Back to Easy Mode vouchers" : "Back to vouchers"}
      </Link>
    </div>
  );
}
