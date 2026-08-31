# Hero greeting and starter-task chips

Kind: change
Status: implemented
Surface: empty-session hero (greeting, composer, starter chips)
Owner: ui/conversation chrome
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related logs: [`2026-08-31-change-narrative-work-phases.md`](./2026-08-31-change-narrative-work-phases.md), [`2026-08-21-change-composer-claude-code-layout.md`](./2026-08-21-change-composer-claude-code-layout.md), [`2026-08-22-change-composer-context-chips-empty-only.md`](./2026-08-22-change-composer-context-chips-empty-only.md)

## Intended change

Owner request (2026-08-31, with a target-app screenshot of Warp's agent home): the empty-session hero should greet the owner ("What would you like to work on?") and offer round starter-task pills with icons under the composer — "Explain this codebase", "Fix a bug", "Write tests", "Refactor code", "Add a feature" — instead of dropping the owner onto a bare composer.

## Expected / actual (before)

Expected: a greeting above the hero composer and one-click round chips below it that fill the composer draft.

Actual: the hero centered the composer with the machine/workspace rail chips and offered no greeting, no guidance, and no starter actions.

## Changes and decisions

- `packages/ui/src/lib/starter-prompts.ts`: data-driven starter list (id, label, Lucide icon — Telescope, Bug, FlaskConical, WandSparkles, Plus). The chip fills the draft with its label; there is no separate richer prompt field yet.
- `packages/ui/src/starter-chips.tsx`: `StarterChips` — round pills (`border-radius: 999px`) in a wrapping centered row under the hero composer; native buttons, so keyboard activation and the `--ring` focus style come free.
- `packages/ui/src/empty-session.tsx`: static `h1` greeting "What would you like to work on?" above the stage children.
- `packages/ui/src/conversation.tsx`: a chip click fills the draft through the existing `onDraftChange` (never auto-sends), then a `requestAnimationFrame` focuses the field and sets the caret at the end of the inserted prompt — the composer's layout effect would otherwise keep the click-stolen caret at offset 0.
- `packages/ui/src/theme.css`: `.empty-session-greeting` (1.5rem medium, centered, matching the welcome-launcher greeting weight) and `.starter-chip` pill styles reusing the composer-rail token language (`--border`/`--card` mixes, `--accent` hover, `--ring` focus-visible).
- Fill-not-send decision: vague starters ("Fix a bug") deserve one review/edit beat — and `@` / `/` enrichment — before a run starts. Direct-send remains a possible follow-up.
- Scope: hero only. The no-session welcome launcher keeps its time-of-day greeting and recents; chips there would have to create a session first.
- Attribution: no third-party code copied; visual inspiration from the owner's target screenshot (Warp agent home), noted in a source comment. `docs/references-and-attribution.md` is unchanged.

## Verification

- Unit verified: `bun test packages/ui/test/conversation.test.ts --timeout 20000` — 21 pass, 0 fail (new: greeting plus all five chips on the hero; greeting and chips absent once the composer docks).
- `bun run typecheck` — pass across all packages. `bun run lint` — 0 errors (8 pre-existing warnings in untouched files).
- Desktop verified: `bun run --filter @pho-code/desktop test:desktop tests/chat.spec.ts` — 5/5 pass on the real Electron surface, including the new journey: greeting visible, chip click fills "Fix a bug", keyboard Enter on a focused chip fills "Write tests", Send shows the message in the transcript, and the chips unmount in the docked layout. The lane's electron-vite build passed as its first step.
- Full unit suite: `bun run test` — 959 pass, 3 fail, all pre-existing and unrelated: the two recorded in the [narrative-phases log](./2026-08-31-change-narrative-work-phases.md) (`notices name the pinned Pi…` — the 0.84.1 → 0.84.4 bump was never carried into the notices template — and `workspace package dependency graph…`, both correlating with the owner's uncommitted `packages/pho-agent` gitlink change), plus a load-related 30 s timeout of `stages the permission package…` under the full parallel run; that test passes in isolation (`bun test scripts/stage-app-resources.test.ts --timeout 20000` — 3 pass, 1 fail, the fail being the same known notices mismatch).
- Packaged: not run — no packaged resources, native dependencies, CSP, or credential paths changed.
- Not verified: owner review of the visual result (greeting weight, chip pill styling, icon choices) on a real empty session.

## Mistakes and corrections

- None new. The desktop lane again had to run outside the agent shell sandbox, as recorded in the [narrative-phases log](./2026-08-31-change-narrative-work-phases.md).

## Owner feedback

Owner picked the slice from a side-by-side of the current UI against the target screenshot: "Starter task chip, round tab, cute icon, welcome (what would you like to work on, etc.)".

## Handoff

- Direct-send chips (skip the draft fill) are a small behavior change if the owner wants Warp's one-click start.
- Starter chips on the no-session welcome launcher would need to pick a workspace and create a session first; deliberately out of scope here.
- The chip set is data-driven; owner-tunable labels/icons live in `lib/starter-prompts.ts`.
- Other ideas from the same comparison remain unscheduled: keyboard-shortcut hints near the hero, sidebar row status glyphs (done / needs-attention), and a warmer default palette.
