# Change — left sidebar and context menu chrome

- Date: 2026-08-21
- Surface: left sidebar (`packages/ui/src/app-sidebar.tsx`), floating menus
  (`floating-menu.tsx`, `session-context-menu.tsx`, `project-context-menu.tsx`),
  session leading mark, menu tokens in `theme.css`.
- Owner request: restyle the left sidebar and the right-click menus after the
  Claude desktop sidebar the owner shared as a screenshot reference.

## What changed

Sidebar:

- Primary actions moved to a raised **New session** row at the top of the stack,
  with Home and Open folder as quiet rows beneath it. All three share one
  `sidebarActionClass`: `h-7`, `rounded-lg`, 13px label at `tracking-[-0.01em]`,
  10px icon gutter, 8px side padding. A pass at the reference's own proportions
  (36px rows, 15px labels) was tried and rejected by the owner as too large — the
  harness wants more rows on screen than the reference does, so only the
  reference's *shape* carries over, not its scale.
- Emphasis is carried by weight and the raised pill only: `New session` is
  `font-medium` on `bg-sidebar-row-hover`, Home and Open folder are
  `font-normal` with muted icons. Home takes medium weight only while it is the
  current page. Owner feedback on the first pass was that the block read flat —
  every row had been `font-medium`, so nothing was primary.
- Action icons are 15px at `strokeWidth={1.75}` — the lucide default of 2
  rendered heavier than the SF text beside it. The typeface itself
  was never the problem: `--font-sans` is `-apple-system`, so the sidebar was
  already set in SF Pro.
- `New session` leads with a plus rather than a compose glyph, matching the
  reference and the per-project inline `+`; plus now means "new session"
  everywhere in the sidebar. The collapsed rail keeps the compose glyph, where an
  icon has to describe itself without a label.
- Session titles and project labels picked up the same slight negative tracking
  so the column sets consistently.
- The `Projects` heading is gone. Project names now carry the grouping, rendered
  as 12px muted labels with no folder glyph and no row box; the active project's
  label takes full foreground. Collapse still toggles from the label and keeps
  `aria-expanded` plus the Expand/Collapse accessible name.
- Each project group gained an inline `+` (`project-new-session-inline`) that
  starts a session in that project. It replaces the session count on hover or
  focus; the count still shows at rest.
- Session rows are `h-7`, project group headers `h-6`, indented to the group's
  own gutter instead of the previous 1.875rem hanging indent. Groups are
  separated by a `gap-1.5` rhythm instead of a divider.
- Footer keeps the Settings and About glyphs and gained a hairline top border.

Session leading mark:

- The chat glyph became a 6px dot: hollow ring when idle, filled when the row is
  selected or carries state, tinted warning/destructive/success for attention,
  failed, and completed. The working phase still renders the 3×3 running mark.

Context menus:

- `.session-context-menu` tokens were replaced by `.app-menu`: 0.75rem radius,
  0.3125rem padding, inset `rounded-lg` hover pills, popover surface, layered
  shadow. Full-width dividers between every item are gone; groups are separated
  by an explicit `role="separator"` rule.
- Items are label-first with no icons and a trailing single-key hint. The hints
  are real: `FloatingMenu` activates the matching item on that key and supports
  Arrow Up/Down roving focus. Session: `Archive chat A` / `Restore chat R`,
  separator, `Move chat to Trash D`. Project: `New session N`,
  `Copy pathname C`, separator, `Remove project D`.
- `MenuItem` and `MenuSeparator` now live in `floating-menu.tsx` so both menus
  share one shape.

## Provenance

The layout follows a screenshot of the Claude desktop sidebar supplied by the
owner. No code was copied from it or from any reference submodule for this pass,
so `docs/references-and-attribution.md` is unchanged. Pre-existing t3code and
pi-gui attribution comments in `app-sidebar.tsx` are retained.

## Verification

- **unit verified:** `bun test packages/ui/test/app-sidebar.test.ts
  packages/ui/test/session-context-menu.test.ts
  packages/ui/test/session-leading-mark.test.ts` — 16 pass.
- **unit verified:** `bun run typecheck` — all packages exit 0.
- **not verified:** repository-wide `bun test`, `bun run lint`, and
  `bun run test:desktop` were not run at the owner's instruction. Next check is
  the Electron lane for the sidebar and menu surfaces.

## Notes for a later pass

- The Claude reference also carries a Home/Code segmented switch, a "Customize"
  entry, and an account row in the footer. Those map to product surfaces this
  harness does not have; they were left out rather than faked.
- Removing the `Projects` heading supersedes
  `2026-08-16-change-sidebar-projects-heading.md`. Restoring it is a one-line
  revert in `app-sidebar.tsx` if the owner wants the label back.
