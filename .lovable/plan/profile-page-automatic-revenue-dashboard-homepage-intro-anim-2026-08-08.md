# Profile page, automatic Revenue dashboard, homepage intro animation

## 1. New "Profile" feature

A new **Profile** tab (with its own glass thumbnail, matching the other feature icons) available to every role.

Contents:

- **Display name** — editable, but only once. After the first save the field locks and shows "Display name already changed — contact the app owner to change it again." The lock is enforced on the server, not just hidden in the UI.
- **Change password** — current password, new password, confirm new password. The current password is verified before the change, the two new fields must match, and a minimum length applies. Success and failure both show a toast.
- **Account role** — shown as a badge (Owner / Admin / Client / Expired / Read-only) with a one-line explanation of what that role can do.
- **Account expiry** — the expiration date and time in the app's Yangon (UTC+06:30) time, plus days remaining. Owner and admin accounts show "Never expires". Expired accounts show the expiry date in red with the reactivation note.
- **Sign out** — moved here from the header. The Sign out button disappears from the header drawer; the header keeps the site selector and email, and the email becomes a link into Profile.

## 2. Revenue: manual entry → automatic dashboard

Revenue stops being a data-entry screen. The price list and the "record a sale" form are removed; earnings are derived from voucher activity that the app already tracks (each voucher carries its plan, price, status, first-use time and expiry).

The page becomes a dashboard:

- **Headline tiles** — Today, This week, This month, All time, each showing earned amount in MMK with a small change indicator against the previous period.
- **Trend chart** — daily earnings for the last 30 days.
- **Voucher funnel** — counts and percentages for Issued / Active / Used / Expired / Unused, so it's visible how much of what was printed actually turned into money.
- **Earnings by plan** — 1 Day / 7 Days / 1 Month / VIP: vouchers sold, redemption rate, and revenue share.
- **Earnings by site and router** — ranked list for multi-site owners, respecting the header site filter.
- **Recent redemptions** — the latest vouchers that went live, with plan, price, time and device.
- Existing PDF/CSV export stays, now exporting the automatic figures.

Recognition rule (stated on the page so the numbers are explainable): a voucher counts as revenue when it is first used, dated at its first-use time. Unused vouchers count as issued-not-earned; expired-unused vouchers are reported as lost potential rather than income. Historic manually recorded sales are kept and folded into the totals so past figures don't vanish.

## 3. Homepage intro animation

A short cinematic title sequence on the public homepage: the aurora field blooms in, the wordmark and the "The place where all the magic happens." headline resolve out of a soft glow with a light sweep across the gradient text, then the feature cards stagger up. Roughly 2 seconds end-to-end, never blocking interaction — content is present and clickable the whole time.

It plays once per browser session, is skipped on any user interaction, and is fully disabled for visitors who have reduced-motion enabled in their system settings.

## Technical notes

- Migration: add `display_name_changed_at` to `profiles`; the update path rejects a second change server-side.
- New `src/lib/profile.functions.ts` (`getProfile`, `updateDisplayName`, `changePassword`), all behind `requireSupabaseAuth`; password change re-verifies the current password before calling the auth update.
- New route `src/routes/_authenticated/app.profile.tsx`, added to `TABS` in `app.tsx`; the Sign out button is removed from the header drawer and re-implemented in Profile with the existing four-step sign-out (cancel queries, clear cache, sign out, replace-navigate to `/auth`).
- Revenue: rewrite `revenueRollup` in `monetization.functions.ts` to aggregate `voucher_codes` (grouped by day/plan/site/router, keyed on first-use time) unioned with legacy `voucher_sales`; `app.revenue.tsx` is rebuilt as a read-only dashboard. `saveVoucherPrice` / `recordVoucherSale` server functions stay in place for existing data but lose their UI.
- Homepage animation is CSS keyframes plus a session-storage guard in `src/routes/index.tsx`, wrapped in a `prefers-reduced-motion` query — no animation library added.
