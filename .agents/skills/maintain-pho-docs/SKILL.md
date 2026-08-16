---
name: maintain-pho-docs
description: Route, update, log, review, and archive Pho Code documentation without mixing current architecture, numbered versions, standalone add-ons, UI work, or historical evidence. Use when behavior, architecture, commands, workstream status, verification, UI feedback, mistakes, or documentation structure changes.
---

# Maintain Pho Code Documentation

## Start from ownership

Read `AGENTS.md`, then route the change:

- `docs/architecture/` — current accepted codebase boundaries and in-depth implementation maps.
- `docs/version/` — current numbered core product, plan, logs, and unpromoted core roadmap.
- `docs/features/` — standalone add-ons that can ship, fail, and retire independently.
- `docs/ui/` — conversation/UI design, implementation, ideas, changes, feedback, and defects.
- `docs/archive/` — immutable closed versions and retired/superseded/abandoned add-ons.
- `docs/current-state.md` — concise dated statement of what exists and each workstream's status.
- `docs/development.md` — current commands, environment, isolation, debugging, and verification procedure.

The root `README.md` is user-facing. Do not add agent instructions, internal architecture, plans, archives, or docs navigation to it.

## Keep documents independent

An active numbered version or promoted add-on owns:

1. local `README.md`;
2. `product.md`;
3. `implementation-plan.md`;
4. `logs/`.

The local README says what to read. Product states outcome, decisions, trust, and non-goals. The implementation plan states architecture changes, milestones, acceptance criteria, and exit gates. Dated logs carry execution history.

Link shared rules instead of copying them. A workstream should be understandable from its own entry point while treating accepted architecture as the shared foundation.

## Record work without creating merge hotspots

Create one dated log per bounded slice, issue, or feedback thread:

```text
YYYY-MM-DD-<milestone-or-kind>-<short-slug>.md
```

Record:

- status, owner, plan/milestone;
- intent and affected contracts/files;
- related workstream logs;
- changes and decisions;
- verification actually run;
- mistakes and corrections;
- owner feedback and UI impact;
- blockers and handoff.

Before changing shared protocol, Electron, accepted architecture, or right-sidebar host behavior, scan active `docs/version/*/logs/`, `docs/features/*/logs/`, and `docs/ui/logs/`. Add reciprocal links between affected records.

Do not hide an error by rewriting old evidence. Correct it in a new log and carry the correction into acceptance review.

## UI records

Use `docs/ui/logs/` for durable `change`, `bug`, `regression`, `feedback`, `mistake`, or `decision` records.

State the surface, expected/actual behavior, reproduction or evidence, owner plan, related workstream, fix, verification, and handoff. Product semantics still belong to the owning version or feature:

- V3 owns Changes, Approve, conflict, and Undo behavior.
- Terminal owns PTY and Terminal product behavior.
- UI owns transcript/composer/sidebar chrome and the shared right-sidebar host.

Park unapproved interaction ideas under `docs/ui/ideas/`; ideas are not implementation contracts.

## Update architecture truthfully

Architecture must reflect the current code, not only historical intentions.

When accepted boundaries change:

1. inspect the actual package/module ownership and enforced imports;
2. update `docs/architecture/README.md` and the relevant detail page;
3. update diagrams, lifecycle, state/storage, security, and testing boundaries;
4. remove stale command/module lists;
5. link proposed or implemented-but-unaccepted behavior back to its workstream instead of presenting it as accepted.

Architecture pages describe invariants and current ownership. Product/UI details belong in their workstream. `eslint.config.js`, protocol validators, tests, and composition code are evidence; prose is not the source of truth.

## Update living summaries

Update `docs/current-state.md` when implemented behavior or workstream status changes. Keep it concise; link evidence.

Update `docs/development.md` when commands, environment variables, isolation, package responsibilities, debugging, or verification procedure changes. Historical PASS counts belong in immutable archive reviews or active logs, not the runbook.

Update attribution/notices when code or assets are copied, materially adapted, or newly shipped.

## Acceptance and archive

One integrator performs acceptance updates:

1. verify the owning plan's gate;
2. write an immutable review;
3. update current state;
4. promote accepted boundary changes into architecture;
5. update development contracts and attribution when affected;
6. leave execution logs intact.

Move a numbered version to `docs/archive/vN/` when it closes.

Keep an accepted add-on under `docs/features/` while it remains current. Move it to `docs/archive/features/` only when retired, superseded, or abandoned, with its product, plan, logs, and closure record.

## Documentation verification

Before completion:

- inspect `git status` and the actual documentation diff;
- preserve unrelated changes and staged renames;
- check relative Markdown links and legacy paths;
- run `git diff --check`;
- confirm the public README contains no internal docs/agent routing;
- confirm every active workstream has README, product, plan, and logs;
- confirm cross-workstream logs have reciprocal links;
- run code/desktop checks only when implementation behavior changed.
