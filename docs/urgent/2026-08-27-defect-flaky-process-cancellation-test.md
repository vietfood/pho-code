# Defect — `process cancellation` unit test is load-flaky

**Kind:** defect
**Status:** Proposed — observed, diagnosed as pre-existing, not fixed

`packages/runtime/test/process-launch.test.ts` → *"process cancellation waits until the child has actually exited"* fails intermittently when the package lanes run together.

## What was observed

During a 2026-08-27 deslop pass, running four lanes in one command:

```bash
bun test packages/protocol/test packages/runtime/test packages/ui/test packages/application/test
```

produced `730 pass, 1 fail` on 2 of 9 runs; the other 7 were clean at `731 pass`. The runtime lane alone (`bun test packages/runtime/test`) passed 3 of 3 at `303 pass`.

**Not caused by that pass.** `git diff` is empty for both `packages/runtime/test/process-launch.test.ts` and `packages/runtime/src/process-launch.ts`; neither was touched.

## Why it is timing-sensitive

The test starts a child that installs a no-op `SIGTERM` handler and never exits on its own, aborts after 40 ms with a 40 ms termination grace and a 2,000 ms timeout, then asserts the failure is `"aborted"` and that at least 70 ms elapsed.

Both assertions are wall-clock dependent under CPU contention. The plausible failure is the 2,000 ms timeout winning the race against a delayed abort callback, which would report `"timeout"` instead of `"aborted"` — but **the failing assertion was not captured**, and the flake did not reproduce in four subsequent attempts, so that mechanism is unconfirmed. Confirm it before changing the test.

## Why it matters more than one red run

AGENTS.md's verification policy turns on "never claim a check passed unless it ran". A lane that fails roughly one run in seven, for reasons unrelated to the change under test, trains readers to re-run until green — which is how a real regression gets waved through.

## What not to do

Do not simply widen the `>= 70` bound or raise the timeout until it stops failing. That hides whichever of the two behaviours is actually racing. Establish which assertion fails first — for example by capturing `result.failure` and the elapsed value in the failure message — then decide whether the fix belongs in the test's timing or in `runArgvCommand`'s abort-versus-timeout precedence.

Bounded process teardown is accepted behaviour with its own closed record; see [`../archive/urgent/agent-stop/`](../archive/urgent/agent-stop/README.md) before changing `runArgvCommand` itself.
