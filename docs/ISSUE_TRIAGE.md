# Issue Triage Playbook

This playbook defines how maintainers should turn GitHub issues into actionable work. It complements the issue templates in [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/).

## Triage owner

Until additional human maintainers are designated, `RionishJovian` is the default triage owner. The triage owner confirms whether a report is actionable, adds labels, requests missing information, assigns a responsible contributor, and sets the next action. Automation accounts such as `lovable-dev[bot]` and `cursoragent` may provide commits or changes, but they are not issue owners.

For feature work, assign the person who owns the affected product area or implementation. For security, authentication, tenant isolation, router access, payments, and server-side integrations, keep review with a maintainer who can inspect secrets and authorization boundaries.

## Required triage fields

Every actionable issue should have a clear problem statement, affected workflow, reproduction or acceptance criteria, environment details where relevant, and an explicit next step. Reports containing secrets, private keys, passwords, tokens, or customer data must be sanitized immediately and handled privately when appropriate.

## Label policy

| Label | When to apply it |
|---|---|
| `bug` | The current behavior is incorrect, broken, or a regression. |
| `enhancement` | A new capability or product improvement is requested. |
| `documentation` | The work changes contributor, user, operational, or API documentation. |
| `good first issue` | The task is small, bounded, and has enough context for a newcomer. |
| `help wanted` | A maintainer welcomes contribution from someone outside the core team. |
| `question` | The report primarily requests clarification rather than a code change. |
| `needs-reproduction` | The report cannot yet be acted on because reproduction details are incomplete. |
| `priority: high` | The issue blocks production, authentication, tenant isolation, security, billing, or a critical router workflow. |
| `priority: medium` | The issue materially affects a supported workflow but has a workaround. |
| `priority: low` | The issue is useful but non-blocking, cosmetic, or an optimization. |
| `area: i18n` | Translation, locale persistence, language selection, or hydration behavior is involved. |
| `area: routers` | Router connectivity, RouterOS, hub, connector, or provisioning behavior is involved. |
| `area: auth` | Authentication, authorization, session, roles, or tenant access is involved. |
| `area: portal` | Hotspot, portal, voucher, or guest-facing portal behavior is involved. |
| `area: billing` | Plans, quotas, purchases, ledger, or payment behavior is involved. |
| `area: security` | Secrets, access control, data exposure, validation, or security hardening is involved. |
| `stale` | The issue has had no meaningful update for 30 days after a reminder. |

Apply one type label, zero or more area labels, and a priority label when the impact is understood. Use `needs-reproduction` instead of guessing priority when the impact cannot yet be assessed.

## Priority and ownership flow

A maintainer should perform an initial triage pass within seven days of a new issue. The maintainer should first remove secrets or request a private report when necessary, then confirm the issue type, affected area, severity, and reproducibility. Next, assign a human owner or explicitly mark the issue as awaiting a maintainer decision. Do not assign bot accounts as responsible collaborators.

A high-priority issue should receive an immediate owner and a short-term mitigation plan. A medium-priority issue should receive an owner and a target milestone when capacity is known. A low-priority issue may remain in the backlog, but it still needs a clear acceptance criterion before implementation.

## Inactivity policy

An issue is considered inactive after **30 days without a meaningful update** from the reporter or maintainers. Post a comment requesting confirmation or missing details, apply `stale`, and allow seven additional days for response. Close the issue as `wontfix` only when the team has decided not to pursue it, or as `invalid` when the report cannot be substantiated after reasonable follow-up. Reopen an issue when new evidence or a reproducible case appears.

A weekly triage review should cover new issues, issues awaiting reproduction, high-priority work without an owner, stale issues reaching the seven-day follow-up point, and issues whose scope or priority has changed.

## Safe issue handling

Never request passwords, private keys, access tokens, service-role keys, or unredacted customer data in a public issue. For router or server problems, ask for sanitized logs and versions. For security vulnerabilities, use GitHub’s private security advisory flow rather than a public issue.

## References

[1]: https://docs.github.com/en/issues/tracking-your-work-with-issues/configuring-issues/quickstart "GitHub Issues quickstart"
[2]: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests "GitHub issue and pull request templates"
[3]: https://github.com/TeamMagic/mikromagic "MikroTik Magic repository"
