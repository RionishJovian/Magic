# Language settings + Fleet, AI Insights and Sites updates

## 1. App language setting (Profile)

Add a language selector on the Profile page with three options:

- English (default, current styling untouched)
- Chinese (Simplified)
- Burmese (Unicode)

How it behaves:

- The choice is saved to the user's account so it follows them across devices, with an instant local fallback so switching applies immediately without a reload.
- Each language gets its own font stack, applied only when that language is active:
  - Burmese: `"Myanmar MN", "Myanmar Sangam MN", "Pyidaungsu", "Noto Sans Myanmar", sans-serif`
  - Chinese: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif`
  - English: unchanged.
- Missing translation = show the English text as-is. No placeholder keys, no broken glyphs.

### Burmese protection rule

Burmese never touches:

- action/active buttons (Save, Delete, Publish, Create, Add, Login, Ask, Run, Deploy, Sign out, …)
- feature/tab titles, brand name, router commands, technical identifiers.

Only descriptions, helper text, empty states, and explanatory copy translate. Chinese may translate buttons as well, since script width is safe.

Technical note: translatable strings are split into two namespaces — `ui.*` (buttons/titles, locked to English under Burmese) and `copy.*` (descriptions, fully translated). A small `useT()` helper reads the active locale and enforces the rule automatically, so the wrong string can't slip into a Burmese button.

Rollout: the shared layout, Profile, Overview, Fleet, AI Insights, Sites, Routers, Access Points, Vouchers, Portal, Revenue and User Manual descriptions get wired to the translation layer in this pass. Anything not yet wired stays English and still renders correctly.

## 2. Fleet — no hourly AI auto-scan

- Confirm no scheduled hourly AI fleet job runs (the hourly cron stays unscheduled).
- Fleet keeps its non-AI health checks (offline routers, CPU/memory/session thresholds, drift).
- When those local checks find an abnormal state, Fleet shows a prompt banner: "Health anomaly detected — run an AI scan to diagnose." The user starts the scan; the app never starts it for them.

## 3. AI Security Insights — 15-minute auto flagging

- While the Insights panel is open and the account has at least one router or access point connected, a light auto-scan runs every 15 minutes.
- Auto runs only flag anomalies: severity, title, evidence line, affected device. No RouterOS fix commands are shown and no fix copy button.
- The full result, including the RouterOS command per finding, appears only when the user presses **Run AI scan** themselves.
- Manual runs stay capped at 30 per calendar month per user, refilling on the 1st. Owners/admins are unlimited.
- Out of clicks → the panel explains the allowance is spent and to request more from the app owner, with the existing request path. Auto runs do not consume the 30-click allowance.

## 4. Sites — Leaflet map

- Add an interactive real-world map to the Sites page. All existing site features (create/edit/delete, timezone, notes, router assignment, site filter) stay exactly as they are.
- Each site gets an optional latitude/longitude. Users set the location by clicking the map or searching an address; the pin can be dragged to fine-tune.
- Every located site shows a status pill on its marker, driven by the routers and access points assigned to it: Online (green), Degraded (amber), Offline (red), or Not connected (grey) when nothing is attached yet.
- Clicking a marker opens a small card with the site name, device counts and a link to filter the dashboard by that site.
- Sites without coordinates keep working as today and appear in the list below the map.

### Technical details

- Migration: `profiles.language` (text, default `en`) and `sites.latitude` / `sites.longitude` (numeric, nullable). Existing RLS/grants cover both tables.
- Leaflet + react-leaflet installed as dependencies; the map component is loaded client-side only (dynamic import behind a client-only boundary) because Leaflet touches `window` during SSR. Leaflet CSS is imported from the installed package in `src/styles.css`, not from a CDN URL.
- Marker status comes from a new server function that aggregates per-site device reachability from the existing router/AP tables — no new polling of devices.
- Auto-scan for Insights is a browser-side 15-minute interval calling a new "flag-only" mode of the existing AI scan server function; it records usage in `ai_usage_events` but is excluded from the manual quota counter.
