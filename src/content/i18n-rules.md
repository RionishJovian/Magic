# MikroTik Magic — i18n rules

This document defines what Chinese and Burmese translations may change. English remains the fallback whenever a key is missing.

## Translate these key groups

### `label` / `ui`

Translate feature, tab, navigation, and section names.

Examples: `Overview`, `Routers`, `Sites`, `Vouchers`, `Fleet`, `Profile`, `Live users`, and `Language coverage`.

Keep brand names, RouterOS protocol names, command paths, configuration values, and identifiers in English inside those translated labels.

`ui` is kept as a compatibility alias for `label`; both use the translated feature-name catalog.

### `copy`

Translate descriptive and supporting text.

Examples: explanations, helper text, empty states, status descriptions, notifications, and setup guidance.

## Keep this key group in English

### `action`

Do not translate action buttons or interactive command labels. They must remain English in every language for consistency and reliable operation.

Examples: `Save`, `Delete`, `Publish`, `Create`, `Add`, `Login`, `Ask`, `Run`, `Refresh`, `Download`, and `Sign out`.

Action strings are not counted as translation coverage. They must not be added to the Chinese or Burmese catalogs.

## Additional rules

- Brand names, product names, RouterOS commands, device names, and technical identifiers stay unchanged unless a dedicated translation is explicitly defined.
- Missing or unclear translations fall back to the English source string; never show a raw key or placeholder to users.
- These rules affect presentation text only. They do not change routing, permissions, data, quotas, backend behavior, or device commands.
- The build-time audit checks coverage, placeholders, script consistency, and accidental action entries.
