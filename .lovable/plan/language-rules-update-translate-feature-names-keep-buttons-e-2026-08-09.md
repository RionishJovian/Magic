# Language rules update: translate feature names, keep buttons English

## New rule

- Feature and tab names (Overview, Routers, Sites, Vouchers, Fleet, Profile, …) are translated in **both** Chinese and Burmese.
- Action buttons (Save, Delete, Publish, Create, Add, Login, Ask, Run, Refresh, Sign out, Run AI scan, …) stay **English in every language**.
- Descriptions and helper text keep translating as today.
- Nothing outside the language layer changes: no data, routing, quotas, or backend behaviour is touched.

## What changes

1. **Split the UI namespace in two**
   - `t.label(...)` — feature/tab/section titles, translated in zh and my.
   - `t.action(...)` — buttons and interactive controls, always rendered in English.
   - `t.copy(...)` — unchanged.
   - `t.ui(...)` stays as a thin alias of `t.label` for a smooth transition so no screen breaks mid-change.

2. **Re-file existing entries**
   - Chinese: move the current button entries out of the translated set so buttons render English again; keep the feature-name entries as translated labels.
   - Burmese: add translations for feature/tab names (Overview, Routers, Sites, Access Points, Connectors, Fleet, Live users, Vouchers, Revenue, Portal, Terminal, Syslog AI, User manual, Profile, Users, Audit log, Scripts, Backups, Credit usage, Quick setup, Language coverage, plus card/section titles) and leave buttons untouched.

3. **Update the audit rules**
   - The old "Burmese must have no UI entries" rule is replaced by: Burmese must translate labels; neither language may hold an entry for an action string.
   - Coverage now counts `label` + `copy` for both languages, so the CI gate stays at 100%.

4. **Language coverage admin page** keeps working; it just reports the new namespaces and the new violation type.

## Technical notes

- Files touched: `src/lib/i18n/types.ts`, `src/lib/i18n/index.tsx`, `src/lib/i18n/locales/zh.ts`, `src/lib/i18n/locales/my.ts`, `scripts/i18n-core.mjs`, `scripts/i18n-sync.mjs`, `src/routes/_authenticated/app.i18n.tsx`, and the call sites that use `t.ui` for buttons (switched to `t.action`).
- Navigation labels in `app.tsx` are resolved through the label namespace, so tabs translate in Burmese without any per-route edits.
- Regenerate `src/lib/i18n/report.generated.ts` via the audit script and typecheck before finishing.
