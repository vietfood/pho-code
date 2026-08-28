# Defect — `process cancellation` unit test is load-flaky

**Kind:** defect
**Status:** **Fixed 2026-08-28** — mechanism confirmed by measurement, test made readiness-gated; `runArgvCommand` unchanged

`packages/runtime/test/process-launch.test.ts` → *"process cancellation waits until the child has actually exited"* failed intermittently when the package lanes ran together.

## What was observed

During a 2026-08-27 deslop pass, running four lanes in one command:

```bash
bun test packages/protocol/test packages/runtime/test packages/ui/test packages/application/test
```

produced `730 pass, 1 fail` on 2 of 9 runs; the other 7 were clean at `731 pass`. The runtime lane alone (`bun test packages/runtime/test`) passed 3 of 3 at `303 pass`.

**Not caused by that pass.** `git diff` was empty for both `packages/runtime/test/process-launch.test.ts` and `packages/runtime/src/process-launch.ts`; neither was touched.

## Why it was timing-sensitive

The test started a child that installs a no-op `SIGTERM` handler and never exits on its own, aborted after 40 ms with a 40 ms termination grace and a 2,000 ms timeout, then asserted the failure was `"aborted"` and that at least 70 ms elapsed.

The original note guessed the 2,000 ms timeout was racing a delayed abort callback and reporting `"timeout"`. **That guess was wrong**, and it is recorded here rather than quietly replaced.

## Confirmed mechanism (2026-08-28)

The race was between the abort and the child's *own startup*, not between abort and timeout.

The 40 ms abort had to arrive after the child installed its `SIGTERM` handler. Measuring the interval from `spawn()` to the handler being installed:

| Condition | min | median | max | samples ≥ 40 ms |
| --- | --- | --- | --- | --- |
| Idle machine | 22 ms | 24 ms | 36 ms | 0 / 20 |
| 12 CPU burners | 101 ms | 345 ms | 600 ms | 20 / 20 |

Idle startup was already within 4 ms of the abort deadline. Under contention it exceeded it every time.

When `SIGTERM` lands before the handler exists, the default disposition terminates the child at once. `requestedFailure` is already `"aborted"` by then, so the *failure assertion still passes* — the child simply dies without the force-kill grace ever running, and the elapsed time collapses. Forcing that ordering deterministically (child busy-waits 100 ms before installing the handler):

| Child boot delay | `result.failure` | elapsed | Failing assertion |
| --- | --- | --- | --- |
| 0 ms | `aborted` | 88 ms | none |
| 100 ms | `aborted` | 44 ms | `>= 70` elapsed |

So the flake was **the elapsed assertion on line 19**, and `runArgvCommand`'s abort-versus-timeout precedence was never implicated. `requestTermination` clears the pending timeout and is idempotent through `requestedFailure`; no production behaviour needed to change, and none did.

## Fix

The bound was not widened and the timeout was not raised — both were rejected in the original note, correctly.

The child now creates a marker file *after* installing its handler, and the test aborts only once that marker exists. This removes the race rather than hiding it: the abort is now guaranteed to reach a process that ignores `SIGTERM`, which is the precondition the test always assumed.

- the grace window is measured from the abort, not from spawn, so the assertion (`>= terminationGraceMs`) states exactly the behaviour under test;
- `timeoutMs` is raised to 30 s purely so a slow *readiness wait* can never be mistaken for the timeout path; the readiness wait has its own 20 s bound and a named error;
- both assertions carry `failure=… elapsedSinceAbort=…` as their message, so a future failure identifies itself instead of needing this investigation again.

## Verification

- `bun test packages/runtime/test/process-launch.test.ts` — 5 consecutive runs, 1 pass each (unit verified).
- Same file, 6 consecutive runs under CPU burners on every core — 1 pass each, in the load regime measured above at 101–600 ms child startup (unit verified).
- `bun test packages/runtime/test` — 3 consecutive runs, `315 pass, 0 fail` (unit verified).
- The documented four-lane repro — 3 consecutive runs, `807 pass, 0 fail` (unit verified). Three clean runs do not by themselves disprove a 1-in-7 flake; the deterministic mechanism proof above is the primary evidence, and this is corroboration.
- `bun run --filter @pho-code/runtime typecheck` and `eslint packages/runtime/test/process-launch.test.ts` — clean.

## A second flake, found while verifying this one

Lane runs during this work reported `1 fail` three times with a different, initially uncaptured identity. It was captured on 2026-08-28 by redirecting the run to a file instead of piping it: `web URL policy > rejects private, loopback, link-local, and metadata addresses`, timing out at 5,006 ms. It is tracked separately in [`2026-08-28-defect-web-url-test-timeout.md`](./2026-08-28-defect-web-url-test-timeout.md) and is unrelated to `runArgvCommand`.

Bounded process teardown is accepted behaviour with its own closed record; see [`../archive/urgent/agent-stop/`](../archive/urgent/agent-stop/README.md) before changing `runArgvCommand` itself.
