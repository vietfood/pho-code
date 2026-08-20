# Urgent queue

Owner-priority work that should happen **before adding more capability**. This is a triage inbox, not a fourth product owner.

Use this folder for defects, safety honesty, startup, and prerequisites that currently block a trustworthy daily driver. Do not park a new add-on here just because it is exciting.

## What this folder is

A short queue the owner can reorder. Each item either:

- stays here as a **track** until its first slice is accepted, then remaining slices stay here or promote; or
- is a **one-file note** that points at the real owner (`features/`, `ui/logs/`, `version/`, or `architecture/`).

Product semantics still belong to the linked owner:

- Electron shell and process model → [`architecture/desktop-shell.md`](../architecture/desktop-shell.md)
- Agent `bash` OS box → [`archive/features/sandbox`](../archive/features/sandbox/README.md)
- Owner PTY → [`features/terminal`](../features/terminal/README.md)
- Conversation chrome → [`ui`](../ui/README.md)
- Numbered-version work (active V4 public beta; later browser/worktrees) → [`version`](../version/README.md)

## What does not belong here

- Accepted architecture (that is `architecture/`, even when the urgent item will later change it).
- A standalone add-on that can ship or fail independently (that is `features/`).
- Ordinary UI polish (that is `ui/logs/` or `ui/ideas/`).
- Closed evidence (that is `archive/`).
- Competitor research catalogs.

## Item shape

| Kind | Layout | Meaning |
| --- | --- | --- |
| One-file note | `YYYY-MM-DD-<kind>-<slug>.md` | Bug, safety reminder, or pointer. Not an implementation contract. |
| Track | folder with `README.md`, `product.md`, `implementation-plan.md`, `logs/` | Multi-slice work that must stay visible until first paint, crash isolation, or a named safety fix exists. |

Kinds for one-file notes: `defect`, `safety`, `startup`, `prerequisite`.

Status vocabulary matches add-ons: **Proposed**, **In implementation**, **Accepted** (then the accepted behavior moves into architecture/current-state), **Deferred**, **Promoted** (moved into `features/` or `version/vN/`).

## Queue

Reorder this table when the owner changes priority. Do not imply that a queued item exists in source.

| Priority | Item | Kind | Status | Owner outcome |
| --- | --- | --- | --- | --- |
| — | No active urgent tracks | — | — | Promote new owner-priority work deliberately |

## Completed

- [Agent stop](../archive/urgent/agent-stop/README.md) — bounded Stop accepted 2026-08-19; Stop-all and bounded teardown accepted and archived 2026-08-20. A dead main-process Pi requires the process extraction now promoted under V4.
- [Window-first Pi core](../archive/urgent/window-first-pi-core/README.md) — metadata chrome before dynamic Pi construction accepted and archived 2026-08-20. Packaged behavior and wall-clock timing were owner-waived/deferred; Pi process extraction is now active V4 work.

## Already in flight (not this queue)

These are owner-approved add-ons. They are not urgent-queue items; do not hide them, and do not fold them into window-first or agent-stop work.

| Work | Status | Documents |
| --- | --- | --- |
| Integrated terminal | In implementation | [`features/terminal`](../features/terminal/README.md) |
| Plan / Agent | Accepted; archived 2026-08-18 | [`archive/features/plan-agent`](../archive/features/plan-agent/README.md) |
| Agent-tool sandbox | Accepted; archived 2026-08-18 | [`archive/features/sandbox`](../archive/features/sandbox/README.md) |

Closed urgent tracks must not block those add-ons, and those add-ons must not wait on `utilityProcess` or bounded Stop.

## Routing

Before changing accepted app startup or window creation versus Pi boot, read the archived [`window-first-pi-core`](../archive/urgent/window-first-pi-core/README.md) contract. Before implementing `HarnessRuntime` extraction, start from the active [`V4 plan`](../version/v4/implementation-plan.md). Before changing accepted `abortRun`, composer Stop, Stop-all, or live-run teardown, read the archived [`agent-stop`](../archive/urgent/agent-stop/README.md) contract.

When an urgent track touches protocol, Electron, accepted architecture, or the right-sidebar host, scan `version/*/logs/`, `features/*/logs/`, `ui/logs/`, and `urgent/*/logs/`, then add reciprocal links. Runtime-process extraction, release signing, updates, and public-beta recovery are active V4 ownership unless a newly discovered urgent defect must land first.
