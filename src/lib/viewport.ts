/**
 * Canonical mobile viewport meta content for the dashboard and static HTML shells.
 * - device-width + initial-scale: correct CSS pixels on phones
 * - viewport-fit=cover: notch / home-indicator safe areas
 * - interactive-widget=resizes-content: keep layouts usable when the soft keyboard opens
 *
 * Do not add maximum-scale / user-scalable=no — that blocks pinch-zoom (a11y).
 */
export const VIEWPORT_CONTENT =
  "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content";

export const VIEWPORT_META_TAG = `<meta name="viewport" content="${VIEWPORT_CONTENT}" />`;
