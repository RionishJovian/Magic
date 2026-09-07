# Mobile polish for the Guided setup wizard

Make the Quick setup (Guided setup) wizard read and tap as cleanly on a phone as it does on desktop. Presentation only — no wizard logic, validation, script generation, or server calls change.

## What's cramped today

Verified in `src/routes/_authenticated/app.quick-setup.tsx`:

- The script rows on Step 3 use a rigid three-column grid (`auto | text | buttons`), so on a narrow screen the Download and Copy buttons squeeze the title and the subtitle is force-truncated to one line.
- Several action rows use `flex justify-between` with no wrapping, so Back / Continue pairs and the "Test the connection" row push out to the edges and crowd each other.
- The Winbox shortcut input is locked to `max-w-[200px]` and the DDNS input to `min-w-[240px]`, which fight the phone's available width instead of filling it.
- The step tracker hides its labels below `sm`, leaving bare numbered bubbles separated by arrows — on a phone it reads as "1 → 2 → 3 → 4 → 5" with no context for the current step.
- Cards, the sticky tracker bar, and the tour dialog all use desktop padding (`p-5` / `p-6`) at every width, so content sits close to the screen edges.
- The Step 4 failure card stacks four rollback buttons in a wrapping row plus nested bullet lists, which becomes a tall wall of text on mobile.

## The changes

**Step tracker**

- On phones show a single compact line: the active step's bubble and its label plus "Step 3 of 5", with the other steps rendered as small dots. Keep the full labelled row from `sm:` upward.
- Keep every completed step tappable, and keep the busy progress bar underneath.

**Cards and page rhythm**

- Card padding becomes `p-4 sm:p-5`, page spacing `space-y-5 sm:space-y-6`, and the sticky tracker `px-3 py-2` with tighter mobile margins so content gets more usable width.

**Buttons and action rows**

- Every step's Back/Continue row becomes a full-width stacked pair on mobile (primary action first visually at the bottom-right on desktop, full-width buttons on mobile) and returns to the current left/right layout at `sm:`.
- All wizard buttons get a 44px minimum touch height on mobile.

**Step 2**

- The Winbox address input drops its fixed max width and goes full width on mobile with the "Open Winbox" button underneath it.
- The reachability panel's title and Run button stack instead of competing for one line.

**Step 3 (script downloads)**

- `ScriptRow` becomes a two-row card on mobile: badge + title + filename on the first line, subtitle below (wrapping, no truncation), then Download and Copy as a full-width two-button row. Desktop keeps today's single-line layout.
- The "How to run it" list and the collapsible script preview get smaller mobile padding, and the preview `<pre>` scrolls horizontally without pushing the page wide.

**Step 4**

- DDNS input goes full width with the Auto-detect button below it on mobile.
- The "Test the connection" block stacks description above a full-width test button.
- The rollback failure card becomes: the error line, two stacked primary actions (soft rollback, hard restore), then the download/copy fallbacks and the explanation list tucked into a collapsible "More options" section on mobile.

**Step 5 and the intro tour**

- Step 5's action links stack full width on mobile.
- The tour dialog gets `p-4 sm:p-6`, a smaller icon tile on mobile, scrolls internally when a slide is tall, and its footer wraps so Skip / Back / Next never overlap the dots.

## Technical notes

- Single file: `src/routes/_authenticated/app.quick-setup.tsx`. No new dependencies.
- Layout follows the project's responsive rule set — mobile-first classes with `sm:` overrides, `min-w-0` on text containers, `shrink-0` on badges and icons, and grid-based header rows instead of bare `flex flex-wrap`.
- Colors stay on existing semantic tokens and the existing `btn-primary` / `btn-ghost` / `input` classes; no hardcoded color utilities are introduced.
- Verification: render each of the 5 steps plus the tour at 390px and 1280px viewports and confirm no horizontal overflow, no clipped labels, and 44px tap targets.
