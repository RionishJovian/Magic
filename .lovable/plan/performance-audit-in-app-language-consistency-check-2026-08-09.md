# Performance audit + in-app language consistency check

## What I found

Confirmed by reading the code this turn:

1. **A real runtime crash on every page load.** `src/routes/[.]lovable.oauth.consent.tsx` defines a module-scope helper `oauth()` and uses it inside the route loader. Route splitting moves the loader into a shared chunk that then tries to import `oauth` from the original file, which does not export it. The browser throws `SyntaxError: ... does not provide an export named 'oauth'`. This is unrelated to language but it is the loudest thing hurting the app right now.

2. **Leaflet is loaded for everyone.** `leaflet/dist/leaflet.css` is imported globally in `src/styles.css`, so its stylesheet ships on every route even though the map only exists on Sites. The map component itself is already lazy + client-only, which is correct.

3. **The language provider re-renders the whole app tree.** `LanguageProvider` wraps `<Outlet />` in `__root.tsx` and starts at `en`, then flips to the stored language in an effect after hydration. Every page therefore renders twice on first load and briefly shows English before switching.

4. **Background polling is heavy.** AI Insights refetches every 15 min even in a hidden tab; Access Points has three concurrent intervals (10s / 30s / 60s), Live 15s, Syslog 15s, Vouchers 20s, Connectors 20s. Several of these lack `refetchIntervalInBackground: false`, so a backgrounded tab keeps hitting the server.

5. **Translation coverage is thin.** Only 4 files call `useT()` (Profile, Sites, Fleet, AI Insights). Everything else is hard-coded English, so switching to 中文 or မြန်မာ changes very little — which reads as "the language feature is broken".

## What I will do

### A. Fix correctness first

- Move the `oauth()` helper and its types out of the consent route into `src/lib/oauth-consent.ts` and import it, so the route file only holds the route declaration. This clears the console SyntaxError.
- Move the Leaflet stylesheet out of the global CSS and load it from the Sites map component so only that route pays for it.
- Have the language provider read the stored language during the first client render (hydration-safe) so pages no longer flash English and re-render the whole tree.

### B. Performance pass

- Add `refetchIntervalInBackground: false` to every polling query that lacks it (Access Points, Live, Syslog, Vouchers, Connectors, AI Insights, Sites, Revenue).
- Pause the AI Insights 15-minute auto-flag when its panel is not visible, and skip it entirely when the account has no routers or access points.
- Consolidate the three Access Points intervals so the slow ones do not stack on top of the 10s one.

### C. Language consistency checker

A new owner/admin-only panel on the Profile page, under the language selector:

- **Coverage per language** — how many known strings each language translates, shown as a bar per language (English, Chinese, Burmese).
- **Untranslated strings** — a list of source strings that have no entry in the selected language, grouped into "Buttons & titles" and "Descriptions", so a gap is obvious at a glance.
- **Inconsistency flags**:
  - a string translated in Chinese but missing in Burmese (or vice versa)
  - a Burmese entry that wrongly translates a button/title (violates the Burmese-stays-English rule)
  - an entry present in a dictionary that no longer matches any source string (stale key)
  - a translation containing characters from the wrong script
- **Live scan** — a "Scan this page" action that walks the rendered page and reports visible text not covered by the translation layer, so untranslated screens surface without reading code.

Everything is read-only and advisory; it never blocks or changes content.

### Technical details

- New `src/lib/i18n/registry.ts` collects every string passed through `useT()` at runtime plus the full dictionary key set, giving both "declared" and "observed" coverage.
- New `src/lib/i18n/audit.ts` computes coverage, missing keys, stale keys, script mismatch (Unicode range test for Myanmar / CJK) and Burmese button-rule violations. Pure functions, unit-testable, no server round-trip.
- New `src/components/LanguageAuditPanel.tsx` renders the report; mounted in `app.profile.tsx` behind the existing owner/admin role check.
- The page scan uses a `TreeWalker` over visible text nodes and compares against the known source strings — client-side only, no persistence.
- No database or schema changes.
