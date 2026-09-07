# Pre-release polish: header drawer, feature moves, mobile

## 1. Header becomes a drawer with a pull handle

Target: the selected header container in `src/routes/_authenticated/app.tsx` (line 121) — branding, the tab nav, and the site select / bell / email / sign-out row. Today it is `sticky top-0` and always on screen; on a 393px phone it wraps into several rows and eats most of the viewport.

New behaviour:

- A small **handle** sits centered on the bottom edge of the header bar (a short rounded pill grip, like a sheet handle, with a chevron that flips).
- **Click the handle** to collapse the tab drawer up out of view; **click again** to pop it back down. Purely toggle-driven — the handle stays visible and tappable in both states.
- The always-visible slim strip keeps the branding dot + "MikroTik Magic", the notifications bell, and the handle, so nothing critical disappears.
- If the drawer is left **open** and the user scrolls down, it does not close — it fades into a **thin liquid glass** state: reduced height, higher transparency, stronger blur, dimmed text, hairline border. Scrolling back to the top restores it to full opacity.
- Scroll never forces the drawer open or shut; only the handle does that.

Implementation: local `open` state plus a rAF-throttled `scrollY` listener that sets a `condensed` flag past ~24px. The header gets `max-h` / `-translate-y` transitions for the drawer, and a `condensed` class that swaps to lower `--glass-bg` alpha, `backdrop-blur-2xl`, and `opacity-70` on the tabs (full opacity restored on hover/focus for accessibility). Respects `prefers-reduced-motion`, handle has `aria-expanded` + a label. On mobile the tab nav inside the drawer becomes one horizontally snap-scrolling row instead of wrapping to five lines.

## 2. Confirmed: fold Quick setup into Routers, rename Fleet

### Quick setup becomes a wizard launched from Routers

- Remove `Quick setup` from the top-level tab list in `src/routes/_authenticated/app.tsx`.
- The Routers page gets a primary **"Add router — guided setup"** action (plus an empty-state card when no routers exist) that opens the wizard.
- The wizard keeps living at `/app/quick-setup` (route stays, so existing links, the Overview quick-setup card, and the intro tour keep working) but is now reached from Routers instead of the nav. It gains a back link to Routers and, on finish, redirects to Routers with the new connection selected.
- Nothing about the wizard's script generation, DDNS auto-detect, reachability checks, or rollback changes.

### Fleet → "AI-Fleet health", visible to every role

- Rename the tab and page heading to **AI-Fleet health**; drop `hideForOwner` so owners see it too, and show it for client, admin, site_manager, read_only.
- Add an explicit **Run AI scan** action on the page (today the AI insights only appear from the hourly cron).
- Quota: owner/admin may run it without limit. Every other role gets **5 manual triggers total**; the button shows "3 of 5 scans left" and disables at zero with a note to ask the owner.
- Expired role: the AI scan action and the insights panel are hidden entirely; expired users still see the read-only router health grid.
- The quota is enforced server-side in a new server function (not just hidden in the UI), counting that user's manual runs.

### Tenants moves inside Users

- Remove the `Tenants` top-level tab; `Users` becomes the single owner-only people tab.
- At the top of the Users page, a two-option switcher (segmented pill control, same glass style as the nav) toggles between **Accounts** (the current user table) and **Tenants** (the tenants overview and impersonation controls).
- The choice is kept in the URL (`/app/users?view=tenants`) so it survives refresh and can be linked; the "Manage" link in the tenant banner points there.
- `/app/tenants` stays as a route that redirects to `/app/users?view=tenants`, so existing links and bookmarks don't break.
- No behaviour change to either view — same data, same actions, just one tab instead of two.

## 3. Mobile polish pass

- Header drawer: two-row grid, truncating email, icon-only sign out under `sm`, horizontal snap-scroll tab strip, 44px handle hit area.

- Tables on Routers, Live users, Vouchers, Revenue, Fleet: switch to stacked card rows under `sm` instead of horizontally scrolling tables; keep tables from `md` up.
- Tap targets raised to 44px minimum for all action buttons; `min-w-0` + `truncate` on every text/widget row so nothing clips at 393px.
- Quick setup: full-width script rows and buttons, sticky "next step" footer.
- Live users popovers/dialogs sized for small screens.
- Banners (expired / expiring / tenant) stack vertically on mobile.

## Technical notes

- Header drawer: `src/routes/_authenticated/app.tsx` (toggle state + handle button) and a `.header-condensed` liquid-glass variant in `src/styles.css`.
- Nav/wizard move: remove the `/app/quick-setup` entry from the tab list in `app.tsx`; add the guided-setup entry point and empty state in `app.routers.tsx`; add a back link + finish redirect in `app.quick-setup.tsx`.
- AI-Fleet health: rename in `app.tsx` and `app.fleet.tsx`, remove `hideForOwner`, add a `runAiScanNow` server function in `src/lib/fleet.functions.ts` that reuses the existing scan logic from the cron hook and enforces the 5-run cap per non-owner/admin user. Manual runs are recorded in `fleet_scan_runs` with `kind = 'ai'` and a `triggered_by` user id so the remaining count is a simple count query — this needs one small migration adding a nullable `triggered_by uuid` column plus an index (no new table).
- Tenants merge: drop the `/app/tenants` nav entry in `app.tsx`; extract the current tenants UI from `app.tenants.tsx` into a component rendered by `app.users.tsx` behind a `view` search param; leave `app.tenants.tsx` as a redirect route.
- Mobile pass and the rest are presentation-only; no other schema or RLS changes.
