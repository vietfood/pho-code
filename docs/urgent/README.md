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
- Numbered-version research (browser, worktrees, public distribution) → [`version/roadmap-vnext.md`](../version/roadmap-vnext.md)

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
| 1 | [Agent stop](./agent-stop/README.md) | safety | Proposed; queued 2026-08-16; not in source | Stop cancels a stuck run within a deadline; permission/ask-user dismiss; Send returns. Does not survive a dead main-process Pi. |
| 2 | [Window-first Pi core](./window-first-pi-core/README.md) | startup + crash isolation | Proposed; queued 2026-08-16; not in source | Window and recents appear before `ModelRuntime.create`; later, Pi can live in `utilityProcess` without claiming a sandbox |

## Already in flight (not this queue)

These are owner-approved add-ons. They are not urgent-queue items; do not hide them, and do not fold them into window-first or agent-stop work.

| Work | Status | Documents |
| --- | --- | --- |
| Integrated terminal | In implementation | [`features/terminal`](../features/terminal/README.md) |
| Plan / Agent | In implementation; M0–M2 in source, not accepted | [`features/plan-agent`](../features/plan-agent/README.md) |
| Agent-tool sandbox | Accepted; archived 2026-08-18 | [`archive/features/sandbox`](../archive/features/sandbox/README.md) |

Window-first and agent-stop must not block those add-ons, and those add-ons must not wait on `utilityProcess` or bounded Stop. Agent-stop and window-first must not wait on each other.

## Routing

Before changing app startup, window creation versus Pi boot, or extracting `HarnessRuntime` from Electron main, read this README and [`window-first-pi-core`](./window-first-pi-core/README.md). Before changing `abortRun`, composer Stop, or cancel of a live run, read [`agent-stop`](./agent-stop/README.md).

When an urgent track touches protocol, Electron, accepted architecture, or the right-sidebar host, scan `version/*/logs/`, `features/*/logs/`, `ui/logs/`, and `urgent/*/logs/`, then add reciprocal links.
