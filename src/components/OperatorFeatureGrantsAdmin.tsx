import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listOperatorFeatureGrantsAdmin,
  setOperatorFeatureRoleDefaults,
  setOperatorFeatureUserGrants,
} from "@/lib/operator-grants.functions";
import {
  listPortalModeGrantsAdmin,
  setPortalModeRoleDefaults,
  setPortalModeUserGrants,
} from "@/lib/portal-grants.functions";
import {
  FEATURE_GRANT_ROLES,
  FEATURE_META,
  GRANTABLE_FEATURES,
  isFloorFeature,
  type FeatureGrantRole,
  type GrantableFeature,
} from "@/lib/operator-features";
import {
  GRANTABLE_PORTAL_MODES,
  PORTAL_MODE_META,
  type GrantablePortalMode,
} from "@/lib/portal/modes";

type RoleDraft = { modes: GrantablePortalMode[]; features: GrantableFeature[] };
type UserDraft = { modes: GrantablePortalMode[]; features: GrantableFeature[] };

function ModeToggles({
  value,
  onChange,
  disabled,
}: {
  value: GrantablePortalMode[];
  onChange: (next: GrantablePortalMode[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {GRANTABLE_PORTAL_MODES.map((mode) => {
        const checked = value.includes(mode);
        return (
          <label
            key={mode}
            className="flex items-center gap-1.5 text-xs"
            title={PORTAL_MODE_META[mode].short}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.checked) onChange([...value, mode]);
                else onChange(value.filter((m) => m !== mode));
              }}
            />
            {PORTAL_MODE_META[mode].label}
          </label>
        );
      })}
    </div>
  );
}

function FeatureToggles({
  value,
  onChange,
  disabled,
}: {
  value: GrantableFeature[];
  onChange: (next: GrantableFeature[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {GRANTABLE_FEATURES.map((feature) => {
        const floor = isFloorFeature(feature);
        const checked = floor || value.includes(feature);
        return (
          <label
            key={feature}
            className="flex items-center gap-1.5 text-xs"
            title={FEATURE_META[feature].hint}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled || floor}
              onChange={(e) => {
                if (floor) return;
                if (e.target.checked) onChange([...value, feature]);
                else onChange(value.filter((f) => f !== feature));
              }}
            />
            {FEATURE_META[feature].label}
            {floor ? <span className="text-[10px] text-muted-foreground">(always)</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function GrantChecks({
  modes,
  features,
  onModes,
  onFeatures,
  disabled,
}: {
  modes: GrantablePortalMode[];
  features: GrantableFeature[];
  onModes: (next: GrantablePortalMode[]) => void;
  onFeatures: (next: GrantableFeature[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Portal modes
        </div>
        <ModeToggles value={modes} onChange={onModes} disabled={disabled} />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Operations actions
        </div>
        <FeatureToggles value={features} onChange={onFeatures} disabled={disabled} />
      </div>
    </div>
  );
}

/** Owner/admin panel: role defaults + per-account grants, including portal modes. */
export function OperatorFeatureGrantsAdmin({
  users,
  showRoleDefaults = true,
}: {
  users: Array<{
    id: string;
    username: string | null;
    display_name: string | null;
    roles: string[];
    operator_feature_grants?: string[];
    portal_mode_grants?: string[];
  }>;
  showRoleDefaults?: boolean;
}) {
  const qc = useQueryClient();
  const listFeaturesFn = useServerFn(listOperatorFeatureGrantsAdmin);
  const setFeatureRoleFn = useServerFn(setOperatorFeatureRoleDefaults);
  const setFeatureUserFn = useServerFn(setOperatorFeatureUserGrants);
  const listModesFn = useServerFn(listPortalModeGrantsAdmin);
  const setModeRoleFn = useServerFn(setPortalModeRoleDefaults);
  const setModeUserFn = useServerFn(setPortalModeUserGrants);

  const featuresAdmin = useQuery({
    queryKey: ["operator-feature-grants-admin"],
    queryFn: () => listFeaturesFn(),
    enabled: showRoleDefaults,
  });
  const modesAdmin = useQuery({
    queryKey: ["portal-mode-grants-admin"],
    queryFn: () => listModesFn(),
    enabled: showRoleDefaults,
  });
  const isPlatformAdmin = Boolean(featuresAdmin.data?.isPlatformAdmin);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["operator-feature-grants-admin"] });
    qc.invalidateQueries({ queryKey: ["portal-mode-grants-admin"] });
    qc.invalidateQueries({ queryKey: ["app-users"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };

  const roleMut = useMutation({
    mutationFn: async (v: { role: FeatureGrantRole } & RoleDraft) => {
      await Promise.all([
        setModeRoleFn({ data: { role: v.role, modes: v.modes } }),
        setFeatureRoleFn({ data: { role: v.role, features: v.features } }),
      ]);
    },
    onSuccess: invalidate,
  });

  const userMut = useMutation({
    mutationFn: async (v: { user_id: string } & UserDraft) => {
      await Promise.all([
        setModeUserFn({ data: { user_id: v.user_id, modes: v.modes } }),
        setFeatureUserFn({ data: { user_id: v.user_id, features: v.features } }),
      ]);
    },
    onSuccess: invalidate,
  });

  const savedRoles = useMemo(() => {
    const map = new Map<string, RoleDraft>();
    for (const role of FEATURE_GRANT_ROLES) map.set(role, { modes: [], features: [] });
    for (const row of modesAdmin.data?.roleDefaults ?? []) {
      const cur = map.get(row.role) ?? { modes: [], features: [] };
      if ((GRANTABLE_PORTAL_MODES as readonly string[]).includes(row.mode)) {
        cur.modes.push(row.mode as GrantablePortalMode);
      }
      map.set(row.role, cur);
    }
    for (const row of featuresAdmin.data?.roleDefaults ?? []) {
      const cur = map.get(row.role) ?? { modes: [], features: [] };
      if ((GRANTABLE_FEATURES as readonly string[]).includes(row.feature)) {
        cur.features.push(row.feature as GrantableFeature);
      }
      map.set(row.role, cur);
    }
    return map;
  }, [modesAdmin.data?.roleDefaults, featuresAdmin.data?.roleDefaults]);

  const [draftRoles, setDraftRoles] = useState<Record<string, RoleDraft> | null>(null);
  const rolesState = draftRoles ?? Object.fromEntries(savedRoles);

  const clients = users.filter(
    (u) =>
      u.roles.includes("client") || u.roles.includes("agent") || u.roles.includes("site_manager"),
  );

  const pending = roleMut.isPending || userMut.isPending;

  return (
    <section className="panel space-y-5 p-5">
      <div>
        <h2 className="text-sm font-semibold">Operator permissions</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Rank 2 Users always have every action and portal mode. Grant Hybrid light, Guest commerce,
          and operations tools to Users, MikroMagic Agents, or Site managers via per-user extras.
          Per-user extras add to the platform role default — they never take rights away. Voucher
          only is always available. Telegram linking and Tier Pass review stay with the primary
          tenant user. Terminal, Users, backups and the Test lab stay locked.
          {showRoleDefaults && isPlatformAdmin
            ? " Dev can also edit global role defaults below."
            : " Use per-user extras for your team."}
        </p>
      </div>

      {featuresAdmin.isError && (
        <p className="text-xs text-danger">
          {(featuresAdmin.error as Error).message}. Paste the operator-feature-grants SQL in Lovable
          Cloud SQL Editor, then republish.
        </p>
      )}
      {modesAdmin.isError && (
        <p className="text-xs text-danger">{(modesAdmin.error as Error).message}</p>
      )}

      {showRoleDefaults && isPlatformAdmin && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Role defaults (platform-wide)
          </h3>
          {FEATURE_GRANT_ROLES.map((role) => {
            const draft = rolesState[role] ?? { modes: [], features: [] };
            return (
              <div
                key={role}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-3"
              >
                <span className="pt-0.5 text-sm font-medium capitalize">
                  {role.replace("_", " ")}
                </span>
                <GrantChecks
                  modes={draft.modes}
                  features={draft.features}
                  disabled={pending}
                  onModes={(modes) => setDraftRoles({ ...rolesState, [role]: { ...draft, modes } })}
                  onFeatures={(features) =>
                    setDraftRoles({ ...rolesState, [role]: { ...draft, features } })
                  }
                />
                <button
                  type="button"
                  className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
                  disabled={pending}
                  onClick={() => roleMut.mutate({ role, ...draft })}
                >
                  Save
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Per-user extras
        </h3>
        {clients.length === 0 && (
          <p className="text-xs text-muted-foreground">No client / agent accounts yet.</p>
        )}
        {clients.map((u) => (
          <UserGrantRow
            key={u.id}
            user={u}
            pending={pending}
            onSave={(draft) => userMut.mutate({ user_id: u.id, ...draft })}
          />
        ))}
      </div>
      {(roleMut.error || userMut.error) && (
        <p className="text-xs text-danger">
          {(roleMut.error as Error | null)?.message ?? (userMut.error as Error | null)?.message}
        </p>
      )}
    </section>
  );
}

function UserGrantRow({
  user,
  pending,
  onSave,
}: {
  user: {
    id: string;
    username: string | null;
    display_name: string | null;
    operator_feature_grants?: string[];
    portal_mode_grants?: string[];
  };
  pending: boolean;
  onSave: (draft: UserDraft) => void;
}) {
  const initialModes = (user.portal_mode_grants ?? []).filter((m): m is GrantablePortalMode =>
    (GRANTABLE_PORTAL_MODES as readonly string[]).includes(m),
  );
  const initialFeatures = (user.operator_feature_grants ?? []).filter((f): f is GrantableFeature =>
    (GRANTABLE_FEATURES as readonly string[]).includes(f),
  );
  const [modes, setModes] = useState<GrantablePortalMode[]>(initialModes);
  const [features, setFeatures] = useState<GrantableFeature[]>(initialFeatures);
  const dirty =
    JSON.stringify([...modes].sort()) !== JSON.stringify([...initialModes].sort()) ||
    JSON.stringify([...features].sort()) !== JSON.stringify([...initialFeatures].sort());

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0 pt-0.5">
        <div className="truncate text-sm font-medium">
          {user.username ?? user.display_name ?? user.id.slice(0, 8)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Per-user grant (adds to role default)
        </div>
      </div>
      <GrantChecks
        modes={modes}
        features={features}
        onModes={setModes}
        onFeatures={setFeatures}
        disabled={pending}
      />
      <button
        type="button"
        disabled={!dirty || pending}
        onClick={() => onSave({ modes, features })}
        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}
