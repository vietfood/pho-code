# Owner review: M3 `/tmp` write asked, then succeeded

Status: owner-verified clarification; add-on not accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md#milestone-3-in-process-file-tool-policy)  
Related logs: [`2026-08-17-m3-file-tool-policy.md`](./2026-08-17-m3-file-tool-policy.md), [`2026-08-17-m2-permission-skip.md`](./2026-08-17-m2-permission-skip.md), [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md), [`../../../ui/logs/2026-08-16-change-sandbox-settings.md`](../../../ui/logs/2026-08-16-change-sandbox-settings.md), [`../../../ui/logs/2026-08-17-feedback-sandbox-tmp-write.md`](../../../ui/logs/2026-08-17-feedback-sandbox-tmp-write.md)

## Intent

Record 2026-08-17 owner testing of Milestones 1–4 and correct the M3 `/tmp` probe.

## Contracts and files

- Product: workspace and platform temp are implicit writable roots; extra write paths outside the workspace may still prompt on `external_directory`
- Matcher: `packages/runtime/src/sandbox-policy.ts` includes `os.tmpdir()` and `/tmp` in writable roots
- Authorizer: `packages/runtime/src/sandbox-permission.ts` cannot skip `path` / `external_directory` asks (bounded-delegation envelope)

## Changes and decisions

No policy change. `/tmp` is in-policy. Settings now names those implicit write roots under Additional write paths.

## Verification

**owner-verified:** 2026-08-17 live app.

- Milestone 1: done
- Milestone 2: done
- Milestone 3 step 2 (`Write a file at /tmp/pho-code-sandbox-should-deny.txt`): permission dock appeared; owner Allowed; write succeeded
- Milestone 4: done

**unit verified:** `bun test packages/ui/test/sandbox-settings.test.ts` — 2 pass after the implicit-roots hint.

A true out-of-policy file-tool deny (home sibling, not `/tmp`, not the workspace) was not re-probed in this note.

## Mistakes and corrections

The manual test guide used `/tmp/...` as “outside the workspace, expect deny, no dock.” That path is platform temp, so it is allowed. Because it is outside the workspace, the permission-system may still ask `external_directory`; Allow once then succeeds. That is Milestone 3 as implemented, not a skip-ask failure.

The correct deny probe is a path that is not the workspace, not `/tmp` or `/var/folders`, and not an extra write path.

## Owner feedback

M1, M2, and M4 passed. M3 `/tmp` write asked and then passed after Allow.

## UI impact

Settings Additional write paths now says workspace and platform temp are already writable, and that writes outside the workspace may still ask once.

## Blockers and handoff

Add-on not accepted until the owner either confirms a real out-of-policy deny (for example `~/Desktop/pho-code-sandbox-should-deny.txt` with sandbox Healthy) or accepts this `/tmp` ask as the implicit-temp contract.
