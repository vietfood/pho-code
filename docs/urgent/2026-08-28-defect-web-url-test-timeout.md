# Defect — a lane-wide event-loop stall times out whichever test is in flight

**Kind:** defect
**Status:** **Fixed 2026-08-28** — mechanism measured, lane timeout calibrated to it; no test or product code changed
**Related:** [`2026-08-27-defect-flaky-process-cancellation-test.md`](./2026-08-27-defect-flaky-process-cancellation-test.md) — a different flake in the same lane, fixed the same day

`bun test packages/runtime/test` intermittently reported one failure:

```text
(fail) web URL policy > rejects private, loopback, link-local, and metadata addresses [5006.07ms]
```

`packages/runtime/test/web-url.test.ts:15`. Not the process-cancellation flake: both were observed after that test was replaced, and it passes 11 consecutive runs of its own, six under saturating load.

## Finding the identity

| Occurrence | Result | Identity |
| --- | --- | --- |
| 1 | `314 pass, 1 fail` | not captured — output was piped through `tail` |
| 2 | `332 pass, 1 fail` | not captured — same mistake |
| 3 | `350 pass, 1 fail` | **captured** by redirecting to a file instead of piping |

## The test cannot be slow

`5006 ms` is Bun's default 5,000 ms per-test timeout. **The test timed out; it did not fail an assertion.** Its body performs no I/O at all:

- five assertions use literal IPs, and `resolvePublicHttpUrl` short-circuits on `net.isIP` before any DNS call (`packages/runtime/src/web-url.ts:85`);
- the sixth injects a fake `lookup` that returns immediately.

So the process was not working on this test's behalf for five seconds. It was not running it.

## Measured mechanism

Preloading an event-loop lag sampler (`setInterval` at 50 ms, reporting drift over 250 ms) into the lane found the stall directly — **in a run that passed**:

| Run | Result | Largest event-loop stall |
| --- | --- | --- |
| Lane, first run after a full Electron build | `351 pass, 0 fail` | **9,314 ms** |
| Lane, three warm repeat runs | `351 pass, 0 fail` | 686 / 717 / 722 ms |
| `pi-runtime.test.ts` alone | `27 pass, 0 fail` | 712 ms |
| Lane after touching three widely-imported sources | `351 pass, 0 fail` | 825 ms |

A 9.3-second stall exceeds the 5-second per-test timeout, so **any test in flight when one lands times out** — and a test whose body is pure microtasks, like this one, is exactly the kind that cannot absorb it. The largest stall appeared only on the first lane run after a full Electron build had churned the page cache, and `touch` did not reproduce it, so this is cold synchronous module loading of a large import graph faulting in from disk, not transpile invalidation and not product code. That also explains all three occurrences: every one followed heavy disk activity, and every re-run afterwards was warm and clean.

## Fix

Raising a timeout is normally the wrong move, and the sibling defect note rejects it explicitly. The difference here is that the number is now **calibrated against a measurement rather than tuned until green**: the environment can block the loop for ~9 s, so a 5 s per-test budget is simply wrong for this lane, and no test written in it can be correct under that budget. The messenger was not the problem.

`bun test` now runs with `--timeout 20000` — roughly twice the largest observed stall, still far below the lane's own 70–90 s runtime, and still fast enough that a genuinely hung test fails promptly.

**`bunfig.toml` cannot carry this.** Bun 1.3.14 ignores `[test] timeout`, verified against a deliberately slow test:

| Configuration | Result for a 6 s test |
| --- | --- |
| Default | fails at 5.01 s |
| `bunfig.toml` `[test] timeout = 20000` (own section, and merged into the existing one) | fails at 5.01 s |
| `bun test --timeout 20000` | passes at 6.02 s |

So the flag lives in the root `test` script, and **a narrow hand-run lane must pass it explicitly** — which is where this bit in the first place. That requirement is recorded in `AGENTS.md`, `docs/development.md`, and the `test-pho-code` skill so the next narrow run carries it.

## Verification

- lag sampler across five lane runs and one isolated file run, tabulated above (unit verified);
- `bunfig` versus CLI timeout behaviour proven against a deliberately slow test (unit verified);
- `bun run test` — 845 pass, 0 fail after the change.

No test assertion, no test timing, and no product code was modified for this defect.

## Found on the way: the repo-wide lane was already red

Moving the command contract to `bun run test` meant running the whole tree rather than the four package lanes, which surfaced a **pre-existing** failure: `apps/desktop/tests/unit/package-boundaries.test.ts` still asserted a `packages/ui` dependency list without `@codexteam/icons`, `@lobehub/icons-static-svg`, or `@meteocons/svg-static`. Those were added with the icon packs in `20ebac4` and the allowlist was never updated. Confirmed pre-existing by reproducing it with this session's changes stashed.

It survived because of where it lives: a `.test.ts` under `apps/desktop/tests/unit/` runs in neither the four package lanes nor the Playwright `test:desktop` lane — only in a repo-wide `bun test`. The allowlist now includes the three icon packs, with a comment recording that they are asset-only and therefore still inside the rule the test enforces.

The lesson generalises past this one test: a narrow lane cannot tell you the tree is green. `bun run test` is the contract for that, which is now what `AGENTS.md` says.
