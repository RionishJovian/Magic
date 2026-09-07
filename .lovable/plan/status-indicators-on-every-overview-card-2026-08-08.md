# Status indicators on every Overview card

Today only the **Routers** and **Live users** cards show a status pill; every other card on Overview is static. This adds a small, glowing status pill next to each card title so you can tell at a glance what is set up, what needs attention, and what is idle.

## What each card will show

| Card                    | Green                                    | Amber                    | Red                      |
| ----------------------- | ---------------------------------------- | ------------------------ | ------------------------ |
| Quick setup             | Setup complete (at least 1 router saved) | Not started              | —                        |
| Routers                 | X/Y online (unchanged)                   | No routers / never seen  | Disconnected (unchanged) |
| Live users              | N online now                             | No routers reachable     | Router disconnected      |
| Vouchers                | N active codes                           | No plans or no codes yet | —                        |
| Portal designer         | Published to a router                    | Not published yet        | Last publish failed      |
| Fleet                   | All devices healthy                      | No devices               | Issues detected          |
| Sites                   | N sites                                  | No sites yet             | —                        |
| UniFi APs               | N controllers connected                  | Not connected            | Last test failed         |
| Revenue                 | Earnings this month                      | No sales yet             | —                        |
| Terminal                | Ready                                    | Read-only for your role  | —                        |
| Syslog AI               | N events today                           | No log source connected  | Critical events present  |
| Profile                 | Active + days left                       | Expiring soon (< 7 days) | Expired                  |
| User management (owner) | N accounts                               | —                        | —                        |
| Scripts (owner)         | Library ready                            | —                        | —                        |
| Credit usage (owner)    | Usage this month                         | —                        | —                        |

Cards where a status would be noise (Scripts) show a plain neutral pill.

## Behaviour

- One combined request feeds all pills, so the page stays fast — no extra load per card.
- Pills refresh on the same 60-second cycle already used for router status.
- While loading, each pill shows a dimmed "Checking…" placeholder instead of jumping.
- Pills are text + colour (not colour alone) and carry an accessible label, so they read correctly for screen readers.
- Cards hidden for your role keep their existing visibility rules; no new data is exposed to Client, Read-only, or Expired accounts.

## Technical notes

- New `src/lib/overview.functions.ts` exporting `getOverviewSummary`, a single authenticated server function that runs cheap, tenant-scoped aggregate counts (vouchers, sites, UniFi controllers, portal deploys, syslog events, revenue for the current month, profile expiry, account count and AI usage for owners). Counts only — no RouterOS probing, so it does not touch devices or consume AI credits.
- Reuse the existing `routersStatus` query for the Routers/Live/Fleet online figures; the new summary covers everything else.
- Extend the existing `StatusDot` component in `src/routes/_authenticated/app.index.tsx` to accept a `neutral` kind and a loading state, and add a `status` resolver per `CardDef` instead of the current `showStatusOn` set.
- Owner-only aggregates are guarded server-side and returned as `null` for non-owners.
