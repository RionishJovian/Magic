# Fix: page doesn't fit the screen on iOS (Safari and installed home-screen app)

Confirmed on the Portal and User manual pages. Measured at iPhone width in a Chromium-based run, both pages fit exactly (`scrollWidth == clientWidth`), so this is WebKit-specific rather than a plain layout bug — the page is being widened/shrink-to-fit only in Safari's engine.

## Likely causes in the current code

- `body` uses `background-attachment: fixed` with three large radial gradients. iOS Safari does not honour fixed attachment properly; it sizes the layer against the document rather than the viewport, which is exactly the mismatch visible in the screenshot (content column ends early, aurora background continues to the right).
- Nothing clips horizontal overflow at the root, so any element WebKit measures slightly wider (long unbroken strings, `pre` blocks, the topology SVG, wide flex rows whose text can't shrink) expands the whole document instead of scrolling inside its own box.
- Full-height containers use `100vh`, which in iOS Safari means the _largest_ viewport height, leaving the layout taller than the visible area with the toolbars shown.
- With `viewport-fit=cover` + translucent status bar, only the dashboard header applies a top safe-area inset; the landing page and intro overlay do not.

## The fix

1. Replace `background-attachment: fixed` on `body` with a `position: fixed` full-viewport backdrop layer behind the content (same visual result, WebKit-safe).
2. Add root-level containment: `overflow-x: clip` and `width: 100%` on `html, body`, plus `max-width: 100%` defaults for `img`, `svg`, `pre`, `table`, and `overflow-wrap: anywhere` for long tokens.
3. Switch `100vh` full-height containers to `100dvh`.
4. Add safe-area insets (top/bottom, and left/right for landscape) on the landing page shell, the cinematic intro overlay, and the page container utility.
5. Re-check the Portal preview card and the User manual SVG/`pre` blocks so each scrolls or scales inside its own panel rather than pushing the page.

## Verification

Run the pages through Playwright's **WebKit** engine (same engine as iOS Safari) at iPhone viewport, assert `document.scrollWidth === clientWidth` on the landing, Portal, and User manual pages, and capture screenshots before/after.

## Note

Nothing here changes the installed app's manifest identity, so your existing home-screen icon picks the fix up on next launch — no reinstall.
