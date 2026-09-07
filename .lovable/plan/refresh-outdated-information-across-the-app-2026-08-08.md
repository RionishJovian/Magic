# Refresh outdated information across the app

A sweep of the landing page, dashboard navigation, Overview cards and User manual found several places still describing an older version of MikroTik Magic. This plan corrects them so every label, count and description matches what the app actually does today.

## What's outdated (verified in code)

1. **Landing page stat "5+ Core tools"** — the app now ships 18 tools/tabs.
2. **Landing copy** only mentions vouchers, portal, live users and fleet. It never mentions Sites, UniFi APs, Revenue, Terminal, Syslog AI, the agentless tunnel or the installable mobile app.
3. **Navigation label "AI-Fleet health"** — the tab was meant to read **Fleet** (the AI scan is a feature inside it). Both the nav item and the Fleet page heading/title still use the old name.
4. **Overview quick-link cards** list only 7 destinations (Quick setup, Routers, Live users, Vouchers, Portal, Users, Scripts). Missing: Sites, UniFi APs, Fleet, Revenue, Terminal, Syslog AI, Profile, Credit usage.
5. **Portal card text** says "Download a ZIP to upload to the router" — one-click deploy to the router exists now.
6. **Portal page description** still advertises "plans" — voucher plans moved to the Vouchers tab.
7. **User manual** covers only REST exposure, status dots and the tunnel. It has no section on the current feature set, roles (including Expired), device limits, Profile, Revenue, or installing the app to a phone home screen.

## Changes

### Landing page (`src/routes/index.tsx`)

- Stats row: `5+ Core tools` becomes `18 Core tools`; keep the other three stats.
- Hero paragraph and the three checkmark chips broadened to reflect routers + sites + UniFi APs, vouchers & revenue, portal, fleet health and AI insights.
- Feature cards: keep the four existing ones, add two more — "Sites & UniFi APs" and "Revenue & reporting" — with matching gradient thumbnails in the same style.
- Meta description / og / twitter descriptions refreshed to name the current tool set (kept under length limits).

### Fleet naming

- `src/routes/_authenticated/app.tsx`: tab label `AI-Fleet health` becomes `Fleet`.
- `src/routes/_authenticated/app.fleet.tsx`: page `<h1>` and `head()` title become `Fleet` / `Fleet health · MikroTik Magic`, description updated to mention live health, traffic, events and on-demand AI scans.

### Overview cards (`src/routes/_authenticated/app.index.tsx`)

- Add cards for Fleet, Sites, UniFi APs, Revenue, Terminal, Syslog AI, Profile, and (owner/admin) Credit usage, each with a gradient tint consistent with the existing set.
- Reword the Portal card to "Edit portal text, colors, logo and hero — then publish straight to the router."
- Reword the Vouchers card to mention plan templates (1d/7d/1M/VIP) now living in Vouchers.
- Respect existing role gating: owner-only cards keep `ownerOnly`, and read-only/Expired accounts keep seeing only the tabs they can open.

### Portal page metadata (`src/routes/_authenticated/app.portal.tsx`)

- Description drops "plans" and describes branding, assets and one-click deploy only.

### User manual (`src/routes/_authenticated/app.manual.tsx`)

- Add a "What's in the app" section listing the 18 tools grouped as general vs owner/admin.
- Add a "Roles and limits" section: owner, admin, client, expired — what each can see, the 30-day client validity with owner reactivation, the 1-device-per-type limit and the approval flow for more, and the 5 AI scans per client.
- Add a short "Install on your phone" note (add-to-home-screen PWA).
- Leave the existing REST exposure, status-dot and tunnel sections intact.

## Notes

Text, labels and metadata only — no database, permission or business-logic changes.
