import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listBankAccounts, saveBankAccount } from "@/lib/bank.functions";
import { toErrorMessage } from "@/lib/error-message";

interface Row {
  slot: number;
  holder_name: string;
  bank_name: string;
  account_number: string;
  enabled: boolean;
  sort: number;
}

const blank = (slot: number): Row => ({
  slot,
  holder_name: "",
  bank_name: "",
  account_number: "",
  enabled: false,
  sort: slot - 1,
});

/**
 * Bank boxes shown on guest checkout. Full account numbers and edits require
 * the Bank details grant (owner/admin always have it).
 */
export function BankSettingsPanel() {
  const qc = useQueryClient();
  const fetchBanks = useServerFn(listBankAccounts);
  const saveFn = useServerFn(saveBankAccount);
  const banks = useQuery({ queryKey: ["bank-accounts"], queryFn: () => fetchBanks({}) });
  const [rows, setRows] = useState<Row[]>([blank(1), blank(2)]);

  useEffect(() => {
    if (!banks.data) return;
    setRows(
      [1, 2].map((slot) => {
        const found = banks.data.accounts.find((a) => a.slot === slot);
        return found ? { ...blank(slot), ...found } : blank(slot);
      }),
    );
  }, [banks.data]);

  const canEdit = banks.data?.can_edit ?? false;

  const save = useMutation({
    mutationFn: (row: Row) => saveFn({ data: row }),
    onSuccess: () => {
      toast.success("Payment details saved");
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const patch = (slot: number, p: Partial<Row>) =>
    setRows((s) => s.map((r) => (r.slot === slot ? { ...r, ...p } : r)));

  return (
    <section className="glass-panel space-y-4 rounded-2xl p-4">
      <div>
        <h2 className="text-sm font-medium">Bank transfer details</h2>
        <p className="text-xs text-muted-foreground">
          Up to two accounts shown to guests at checkout. Guests transfer the plan price and upload
          a receipt for your approval.
        </p>
      </div>

      {banks.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        rows.map((r) => (
          <div key={r.slot} className="space-y-2 rounded-xl border border-border/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Bank {r.slot}</span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={!canEdit}
                  onChange={(e) => patch(r.slot, { enabled: e.target.checked })}
                />
                Show at checkout
              </label>
            </div>
            <input
              value={r.holder_name}
              disabled={!canEdit}
              onChange={(e) => patch(r.slot, { holder_name: e.target.value })}
              placeholder="Account holder name"
              aria-label={`Bank ${r.slot} account holder name`}
              className="min-h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-xs"
            />
            <input
              value={r.bank_name}
              disabled={!canEdit}
              onChange={(e) => patch(r.slot, { bank_name: e.target.value })}
              placeholder="Bank name (e.g. KBZ, AYA, Wave)"
              aria-label={`Bank ${r.slot} bank name`}
              className="min-h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-xs"
            />
            <input
              value={r.account_number}
              disabled={!canEdit}
              onChange={(e) => patch(r.slot, { account_number: e.target.value })}
              placeholder="Account / card number"
              aria-label={`Bank ${r.slot} account number`}
              className="min-h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-xs"
            />
            {canEdit && (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(r)}
                className="min-h-10 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Save bank {r.slot}
              </button>
            )}
          </div>
        ))
      )}
      {!canEdit && !banks.isLoading && (
        <p className="text-xs text-muted-foreground">
          Account numbers are masked for your role. Only the account owner can edit them.
        </p>
      )}
    </section>
  );
}
