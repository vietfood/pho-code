---
name: change-review-and-recovery
description: Review the actual change, explain risk and recovery, and verify completion without performing irreversible cleanup. Use when reviewing a diff, checking whether work is done, or deciding how to recover from a bad edit.
---

# Change review and recovery

Review the change that exists, not the change that was intended.

## Review

1. Inspect the actual diff or edited files.
2. Explain what can go wrong: behavior, data, permissions, and how to notice it.
3. Name the recovery path. Prefer reversible steps. Permanent deletion, hard reset, and `rm` are unavailable.

## Completion

- Verify with the checks the owner named, or the smallest relevant typecheck/test/lint.
- Say what was not verified.
- Do not empty Trash, rewrite history, or invent a restore you have not performed.
