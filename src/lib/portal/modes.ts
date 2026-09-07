import { hasTenantPrimaryRole } from "../app-role";

/**
 * Guest captive-portal modes and owner → role/user permission resolution.
 *
 * Modes (RouterOS 7.1+ Hotspot HTML — no cloud payment scaffolds):
 * - voucher_only  — code login only (always allowed)
 * - hybrid_light  — voucher + seller contact + POS distance helpers
 * - commerce      — customizable payment-method cards + packages + trial access
 *
 * Platform owner/admin always may operate every mode. Other accounts need either
 * a per-user grant or a role-default grant for hybrid_light / commerce.
 */

export const PORTAL_GUEST_MODES = ["voucher_only", "hybrid_light", "commerce"] as const;
export type PortalGuestMode = (typeof PORTAL_GUEST_MODES)[number];

/** Modes that require an explicit owner grant (voucher_only does not). */
export const GRANTABLE_PORTAL_MODES = ["hybrid_light", "commerce"] as const;
export type GrantablePortalMode = (typeof GRANTABLE_PORTAL_MODES)[number];

export const PORTAL_GRANT_ROLES = ["client", "agent", "site_manager"] as const;
export type PortalGrantRole = (typeof PORTAL_GRANT_ROLES)[number];

/**
 * What a payment-method card does inside the Hotspot HTML directory.
 * All actions are RouterOS-native (local HTML + optional Hotspot trial login).
 */
export const PAYMENT_METHOD_ACTIONS = ["seller", "pos", "pay_info", "packages"] as const;
export type PaymentMethodAction = (typeof PAYMENT_METHOD_ACTIONS)[number];

export type PortalPaymentMethod = {
  id: string;
  enabled: boolean;
  label: string;
  description: string;
  /** Card accent / border colour on the captive portal. */
  accentHex: string;
  action: PaymentMethodAction;
  /** pay_info: heading shown on the instructions page. */
  infoTitle: string;
  /** pay_info: bank / KBZ / Wave / custom instructions (plain text). */
  infoBody: string;
  /** Optional value guests must copy before trial Connect unlocks. */
  copyValue: string;
  sort: number;
};

export const DEFAULT_PAYMENT_METHODS: PortalPaymentMethod[] = [
  {
    id: "transfer",
    enabled: true,
    label: "Bank / wallet transfer",
    description: "Get temporary access, then transfer and buy a voucher code.",
    accentHex: "#3b82f6",
    action: "pay_info",
    infoTitle: "Transfer details",
    infoBody: "Replace this text with your bank or mobile-wallet account details.",
    copyValue: "",
    sort: 0,
  },
  {
    id: "seller",
    enabled: true,
    label: "Talk to seller",
    description: "Temporary internet to message our seller and buy a code.",
    accentHex: "#22c55e",
    action: "seller",
    infoTitle: "",
    infoBody: "",
    copyValue: "",
    sort: 1,
  },
  {
    id: "pos",
    enabled: true,
    label: "Point of sale",
    description: "Find nearby shops and buy a voucher in person.",
    accentHex: "#a855f7",
    action: "pos",
    infoTitle: "",
    infoBody: "",
    copyValue: "",
    sort: 2,
  },
];

export const PORTAL_MODE_META: Record<
  PortalGuestMode,
  { label: string; short: string; photos: string }
> = {
  voucher_only: {
    label: "Voucher only",
    short: "Guests enter a code. No plan or payment on the portal.",
    photos: "Photo 1 primary path",
  },
  hybrid_light: {
    label: "Hybrid light",
    short: "Voucher login + seller contact and nearby points of sale.",
    photos: "Photos 1, 4, 5",
  },
  commerce: {
    label: "Guest commerce",
    short: "Bank payment method + Plans + Trial internet access",
    photos: "Photos 1–5",
  },
};

export function isPortalGuestMode(value: unknown): value is PortalGuestMode {
  return typeof value === "string" && (PORTAL_GUEST_MODES as readonly string[]).includes(value);
}

export function isGrantablePortalMode(value: unknown): value is GrantablePortalMode {
  return typeof value === "string" && (GRANTABLE_PORTAL_MODES as readonly string[]).includes(value);
}

function asAction(raw: unknown): PaymentMethodAction {
  if (typeof raw === "string" && (PAYMENT_METHOD_ACTIONS as readonly string[]).includes(raw)) {
    return raw as PaymentMethodAction;
  }
  return "pay_info";
}

function asHex(raw: unknown, fallback: string): string {
  return typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

/** Normalize stored JSON (including legacy pix/online/whatsapp/pos flags). */
export function parsePaymentMethods(raw: unknown): PortalPaymentMethod[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((row, i) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const id =
          typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 40) : `method-${i + 1}`;
        return {
          id,
          enabled: o.enabled !== false,
          label: String(o.label ?? "Payment method").slice(0, 80),
          description: String(o.description ?? "").slice(0, 240),
          accentHex: asHex(o.accentHex ?? o.accent_hex, "#3b82f6"),
          action: asAction(o.action),
          infoTitle: String(o.infoTitle ?? o.info_title ?? "").slice(0, 80),
          infoBody: String(o.infoBody ?? o.info_body ?? "").slice(0, 2000),
          copyValue: String(o.copyValue ?? o.copy_value ?? "").slice(0, 120),
          sort: Number.isFinite(Number(o.sort)) ? Number(o.sort) : i,
        } satisfies PortalPaymentMethod;
      })
      .filter((m): m is PortalPaymentMethod => !!m)
      .sort((a, b) => a.sort - b.sort);
  }

  // Legacy boolean channel map from the first scaffold — map into real methods.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if ("pix" in o || "online" in o || "whatsapp" in o || "pos" in o) {
      const out: PortalPaymentMethod[] = [];
      if (o.pix === true || o.online === true) {
        out.push({
          ...DEFAULT_PAYMENT_METHODS[0],
          id: "transfer",
          label: o.pix === true ? "Transfer" : "Online / transfer",
          enabled: true,
          sort: 0,
        });
      }
      if (o.whatsapp !== false) {
        out.push({ ...DEFAULT_PAYMENT_METHODS[1], sort: 1 });
      }
      if (o.pos !== false) {
        out.push({ ...DEFAULT_PAYMENT_METHODS[2], sort: 2 });
      }
      return out.length ? out : DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
    }
  }

  return DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
}

export function enabledPaymentMethods(
  methods: readonly PortalPaymentMethod[],
  mode: PortalGuestMode,
): PortalPaymentMethod[] {
  if (mode === "voucher_only") return [];
  const enabled = methods.filter((m) => m.enabled);
  if (mode === "hybrid_light") {
    return enabled.filter((m) => m.action === "seller" || m.action === "pos");
  }
  return enabled;
}

/**
 * Resolve which guest modes an account may enable on their portal.
 * Owner/admin → all. Everyone → voucher_only. Grants add hybrid/commerce.
 */
export function resolveAllowedPortalModes(input: {
  roles: readonly string[];
  userGrants: readonly string[];
  roleDefaults: ReadonlyArray<{ role: string; mode: string }>;
  isPlatformAdmin?: boolean;
}): PortalGuestMode[] {
  const roles = input.roles ?? [];
  if (hasTenantPrimaryRole(roles) || input.isPlatformAdmin) {
    return [...PORTAL_GUEST_MODES];
  }

  const allowed = new Set<PortalGuestMode>(["voucher_only"]);

  for (const g of input.userGrants) {
    if (isGrantablePortalMode(g)) allowed.add(g);
  }

  for (const row of input.roleDefaults) {
    if (!roles.includes(row.role)) continue;
    if (isGrantablePortalMode(row.mode)) allowed.add(row.mode);
  }

  return PORTAL_GUEST_MODES.filter((m) => allowed.has(m));
}

export function canOperatePortalMode(
  mode: PortalGuestMode,
  input: {
    roles: readonly string[];
    userGrants: readonly string[];
    roleDefaults: ReadonlyArray<{ role: string; mode: string }>;
    isPlatformAdmin?: boolean;
  },
): boolean {
  return resolveAllowedPortalModes(input).includes(mode);
}

/** @deprecated use parsePaymentMethods / enabledPaymentMethods */
export type CommerceChannels = {
  pix: boolean;
  online: boolean;
  whatsapp: boolean;
  pos: boolean;
};
