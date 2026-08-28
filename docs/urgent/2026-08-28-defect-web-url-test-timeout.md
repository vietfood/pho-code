# Defect — `web URL policy` test times out intermittently in the runtime lane

**Kind:** defect
**Status:** Proposed — **identified 2026-08-28**, mechanism not yet confirmed, not fixed
**Related:** [`2026-08-27-defect-flaky-process-cancellation-test.md`](./2026-08-27-defect-flaky-process-cancellation-test.md) — a different flake in the same lane, fixed 2026-08-28

`bun test packages/runtime/test` intermittently reports one failure:

```text
(fail) web URL policy > rejects private, loopback, link-local, and metadata addresses [5006.07ms]
```

`packages/runtime/test/web-url.test.ts:15`. This is **not** the process-cancellation flake: both were observed after that test was replaced, and it passes 11 consecutive runs of its own, six under saturating load.

## Evidence

| Occurrence | Result | Identity |
| --- | --- | --- |
| 1 | `314 pass, 1 fail` | not captured — output was piped through `tail` |
| 2 | `332 pass, 1 fail` | not captured — same mistake |
| 3 | `350 pass, 1 fail` | **captured**: `web URL policy > rejects private, loopback, link-local, and metadata addresses`, `5006.07ms` |

Redirecting the run to a file instead of piping it is what produced occurrence 3. That was the whole recommendation of the first version of this note, and it worked on the first try.

Around those three: 13 clean runs of the runtime lane and 4 clean runs of the four-lane command, plus 5 clean runs of `web-url.test.ts` in isolation.

## What the number means

`5006 ms` is bun's default 5,000 ms per-test timeout plus overhead. **The test timed out; it did not fail an assertion.**

That matters because the test body cannot legitimately take five seconds. All six of its assertions resolve without I/O:

- five use literal IPs (`127.0.0.1`, `10.0.0.4`, `169.254.169.254`, `192.168.1.1`, `[::1]`), and `resolvePublicHttpUrl` short-circuits on `net.isIP` before any DNS call (`packages/runtime/src/web-url.ts:85`);
- the sixth injects a fake `lookup` that returns immediately.

No test in that file performs a real DNS lookup. So the process was not doing work on this test's behalf for five seconds — it was not running it.

## Candidate mechanisms, neither confirmed

1. **Event-loop starvation.** The runtime lane spawns real child processes (process launch, sandbox, retrieval indexing). If the test process is starved long enough, a body of pure microtasks can still exceed a wall-clock deadline. This fits the wall-clock signature and the fact that both earlier occurrences followed heavy process activity.
2. **A pending handle from an earlier file** delaying the runner before this test's body is entered, so the elapsed time is attributed to a test that never ran slowly.

## What to do next

Do **not** raise the timeout. A 5-second budget is enormous for six synchronous rejections; if it is being exceeded, something else in the lane is stalling the process, and that is worth knowing before it hides a real regression somewhere less obvious.

1. Re-run the lane with `--timeout 20000` until it either passes consistently (supports starvation) or fails at 20 s (a genuine hang, and a much more serious finding).
2. If starvation is confirmed, look for the lane's blocking operations rather than adjusting this test — it is the messenger.
3. Always redirect the run to a file. Every occurrence lost so far was lost to a pipe.

## Why it matters

AGENTS.md's verification policy turns on "never claim a check passed unless it ran". A lane that fails occasionally trains readers to re-run until green. One flake of this shape was just fixed by finding the real mechanism rather than widening a bound; this one deserves the same.
