# Settings Sandbox: `/tmp` write asked during owner M3 test

Kind: feedback
Status: clarified; implicit-temp copy added
Surface: Settings → Sandbox, permission dock on file write
Owner: features/sandbox (policy); ui/settings chrome (hint)
Owning plan: [`../../features/sandbox/implementation-plan.md`](../../archive/features/sandbox/implementation-plan.md)
Related logs: [`../../features/sandbox/logs/2026-08-17-owner-m3-tmp-ask.md`](../../archive/features/sandbox/logs/2026-08-17-owner-m3-tmp-ask.md), [`../../features/sandbox/logs/2026-08-17-m3-file-tool-policy.md`](../../archive/features/sandbox/logs/2026-08-17-m3-file-tool-policy.md), [`2026-08-16-change-sandbox-settings.md`](./2026-08-16-change-sandbox-settings.md)

## Expected / actual

Expected (bad probe): write `/tmp/pho-code-sandbox-should-deny.txt` with Healthy sandbox → no dock, tool error, file not created.
Actual: permission dock; owner Allowed; write succeeded.

## Reproduction

Owner-tested 2026-08-17 with sandbox on. Prompt: write a file under `/tmp`.

## Changes and decisions

`/tmp` is an implicit writable root with the workspace. Extra-workspace in-policy writes may still prompt on `external_directory`. Settings now states that.

## Verification

See the owning sandbox log. `bun test packages/ui/test/sandbox-settings.test.ts` covers the new hint.

## Mistakes / corrections

The chat test guide treated `/tmp` as out-of-policy. Correction: use a home path that is not workspace and not temp.

## Owner feedback

M1, M2, M4 done. M3 `/tmp` asked, then passed after Allow.

## Handoff

Product still needs one out-of-policy deny probe if the owner wants M3 closed on that criterion.
