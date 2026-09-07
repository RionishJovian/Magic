import {
  GRANTABLE_PORTAL_MODES,
  PORTAL_GUEST_MODES,
  PORTAL_MODE_META,
  DEFAULT_PAYMENT_METHODS,
  PAYMENT_METHOD_ACTIONS,
  type PortalGuestMode,
  type PortalPaymentMethod,
  type PaymentMethodAction,
} from "@/lib/portal/modes";

export type PortalGuestDraft = {
  guest_mode: PortalGuestMode;
  payment_methods: PortalPaymentMethod[];
  seller_phone: string;
  seller_label: string;
  trial_minutes: number;
  trial_cooldown_hours: number;
  need_code_label: string;
  ask_desk_hint: string;
};

function newMethod(): PortalPaymentMethod {
  return {
    id: `method-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    label: "New method",
    description: "Describe how guests pay or get a code.",
    accentHex: "#3b82f6",
    action: "pay_info",
    infoTitle: "Payment details",
    infoBody: "",
    copyValue: "",
    sort: 99,
  };
}

export function PortalGuestModePanel({
  draft,
  allowedModes,
  onChange,
}: {
  draft: PortalGuestDraft;
  allowedModes: readonly PortalGuestMode[];
  onChange: (next: PortalGuestDraft) => void;
}) {
  const allowed = new Set(allowedModes);
  const mode = draft.guest_mode;
  const showHybrid = mode === "hybrid_light" || mode === "commerce";
  const showMethods = mode === "commerce" || mode === "hybrid_light";
  const methods = draft.payment_methods.length
    ? draft.payment_methods
    : DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));

  const updateMethod = (id: string, patch: Partial<PortalPaymentMethod>) => {
    onChange({
      ...draft,
      payment_methods: methods.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };

  return (
    <section className="panel space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">Guest portal mode</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          All guest flows deploy as RouterOS 7.1+ Hotspot HTML. Temporary access uses native Hotspot
          trial — not cloud payment scaffolds. Hybrid light and Guest commerce need an owner
          permission grant.
        </p>
      </div>

      <div className="grid gap-2">
        {PORTAL_GUEST_MODES.map((m) => {
          const meta = PORTAL_MODE_META[m];
          const can = allowed.has(m);
          const selected = mode === m;
          return (
            <label
              key={m}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                selected ? "border-primary/60 bg-primary/5" : "border-border"
              } ${!can ? "opacity-50" : ""}`}
            >
              <input
                type="radio"
                className="mt-1"
                name="guest_mode"
                value={m}
                checked={selected}
                disabled={!can}
                onChange={() => onChange({ ...draft, guest_mode: m })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{meta.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{meta.short}</span>
                <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                  {meta.photos}
                  {!can && m !== "voucher_only" ? " · locked — ask owner" : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {showHybrid && (
        <div className="grid gap-3 border-t border-border pt-4">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">“I don’t have a code” label</span>
            <input
              className="input"
              value={draft.need_code_label}
              onChange={(e) => onChange({ ...draft, need_code_label: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Ask desk hint</span>
            <input
              className="input"
              value={draft.ask_desk_hint}
              onChange={(e) => onChange({ ...draft, ask_desk_hint: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Seller label</span>
            <input
              className="input"
              value={draft.seller_label}
              onChange={(e) => onChange({ ...draft, seller_label: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Seller phone / chat number</span>
            <input
              className="input"
              value={draft.seller_phone}
              placeholder="+95…"
              onChange={(e) => onChange({ ...draft, seller_phone: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Trial minutes (ROS)</span>
              <input
                type="number"
                min={1}
                max={120}
                className="input"
                value={draft.trial_minutes}
                onChange={(e) =>
                  onChange({ ...draft, trial_minutes: Number(e.target.value) || 10 })
                }
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Cooldown hours (guest copy)</span>
              <input
                type="number"
                min={0}
                max={168}
                className="input"
                value={draft.trial_cooldown_hours}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    trial_cooldown_hours: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Deploy enables Hotspot <code className="text-[10px]">trial</code> on the target profile
            (RouterOS 7.1+): <code className="text-[10px]">trial-uptime</code>,{" "}
            <code className="text-[10px]">trial-user-profile=mm-trial</code>, Connect posts as{" "}
            <code className="text-[10px]">T-$(mac-esc)</code>. POS distance uses Sites coordinates.
          </p>
        </div>
      )}

      {showMethods && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Payment / acquisition methods</p>
            {mode === "commerce" && (
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary hover:text-primary"
                onClick={() =>
                  onChange({
                    ...draft,
                    payment_methods: [...methods, newMethod()],
                  })
                }
              >
                Add method
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Names, descriptions and accent colours are fully customizable. Actions map to Hotspot
            pages (seller, POS, pay instructions, or packages) — no Pix/card provider embeds.
          </p>
          {methods.map((m) => (
            <div
              key={m.id}
              className="space-y-2 rounded-xl border p-3"
              style={{ borderColor: `${m.accentHex}66` }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => updateMethod(m.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <input
                  type="color"
                  aria-label="Accent colour"
                  className="h-8 w-10 rounded border border-border bg-surface"
                  value={m.accentHex}
                  onChange={(e) => updateMethod(m.id, { accentHex: e.target.value })}
                />
                <select
                  className="input max-w-[9rem] py-1 text-xs"
                  value={m.action}
                  onChange={(e) =>
                    updateMethod(m.id, { action: e.target.value as PaymentMethodAction })
                  }
                >
                  {PAYMENT_METHOD_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                {mode === "commerce" && (
                  <button
                    type="button"
                    className="ml-auto text-[11px] text-danger hover:underline"
                    onClick={() =>
                      onChange({
                        ...draft,
                        payment_methods: methods.filter((x) => x.id !== m.id),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                className="input text-sm"
                value={m.label}
                placeholder="Method name"
                onChange={(e) => updateMethod(m.id, { label: e.target.value })}
              />
              <input
                className="input text-xs"
                value={m.description}
                placeholder="Short description on the method card"
                onChange={(e) => updateMethod(m.id, { description: e.target.value })}
              />
              {m.action === "pay_info" && (
                <>
                  <input
                    className="input text-xs"
                    value={m.infoTitle}
                    placeholder="Instructions heading"
                    onChange={(e) => updateMethod(m.id, { infoTitle: e.target.value })}
                  />
                  <textarea
                    className="input text-xs"
                    rows={3}
                    value={m.infoBody}
                    placeholder="Bank / wallet / transfer instructions shown on the Hotspot page"
                    onChange={(e) => updateMethod(m.id, { infoBody: e.target.value })}
                  />
                  <input
                    className="input text-xs"
                    value={m.copyValue}
                    placeholder="Optional copy-to-unlock value (account number)"
                    onChange={(e) => updateMethod(m.id, { copyValue: e.target.value })}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!GRANTABLE_PORTAL_MODES.every((m) => allowed.has(m)) && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
          Missing hybrid or commerce permission? The platform owner can grant modes per user or as a
          role default on Users.
        </p>
      )}
    </section>
  );
}
