---
name: bug-and-test-diagnosis
description: Reproduce narrowly, separate root cause from collateral failures, and implement only the requested correction. Use when a test fails, a bug is reported, or a fix must stay scoped to the failing behavior.
---

# Bug and test diagnosis

Reproduce the failure before changing code.

## Sequence

1. Reproduce the reported failure with the narrowest command or test that shows it.
2. Read the failing assertion, stack, and the code it exercises.
3. Name the **root cause** separately from collateral failures, flaky setup, or pre-existing issues.
4. Change only what the owner asked to correct. Do not expand into nearby cleanup.

## After a fix

- Re-run the same failing check.
- Say what still fails and whether it is related.
- Do not disable tests, snapshot over the failure, or weaken assertions to obtain a green run.
