# Milestone 2: permission skip for in-box bash

Status: in source, not accepted  
Owner: features/sandbox  
Plan: [`../implementation-plan.md`](../implementation-plan.md#milestone-2-permission-skip-for-in-box-bash)  
Related logs: [`2026-08-16-m1-settings.md`](./2026-08-16-m1-settings.md), [`2026-08-17-m1-acceptance-review.md`](./2026-08-17-m1-acceptance-review.md), [`2026-08-17-m3-file-tool-policy.md`](./2026-08-17-m3-file-tool-policy.md), [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md), [`../../../ui/logs/2026-08-16-change-sandbox-settings.md`](../../../ui/logs/2026-08-16-change-sandbox-settings.md), [`2026-08-16-related-urgent-window-first.md`](./2026-08-16-related-urgent-window-first.md), [`2026-08-16-related-urgent-agent-stop.md`](./2026-08-16-related-urgent-agent-stop.md)

## Intent

Skip permission **asks** for healthy, Seatbelt-wrapped agent bash. Keep permission **denies**. Do not offer an unsandbox retry. Disable restores today’s asks.

## Contracts and files

- Product: [`../product.md`](../product.md) permission interaction table
- Plan: deny-first, then skip ask for wrapped `bash` / `user_bash`; `rm` and privilege stay deny; OS network deny is a tool error
- Public hook: pinned `@gotgenes/pi-permission-system` `24.0.0` `registerAuthorizer` + `authorizerChain` (not a fork)
- Runtime: `packages/runtime/src/sandbox-permission.ts`; factory binds on `permissions:ready` and reads the published service via `Symbol.for("@gotgenes/pi-permission-system:service")`
- Permission adapter: `syncHarnessPermissionPolicy` / `patchPermissionConfig` append `pho-code-sandbox` to `authorizerChain`
- Not in this milestone: file-tool intercept (M3), `package:mac` staging (M4)

## Changes and decisions

- Authorizer runs only after the permission engine has already decided `ask`. Policy `deny` never reaches it.
- Skip applies only while sandbox status is `healthy`. Failed/unavailable/off defer to the existing prompt.
- `path` and `external_directory` asks stay prompts: the permission-system bounded-delegation envelope forbids a link from allowing those surfaces.
- On guarded, a bash command that also trips the path gate (for example `rm` of a workspace file) may still prompt as a path ask. Trash deny is verified on balanced, where path is allow and bash deny remains.
- File tools, MCP, and YOLO semantics are unchanged. Sandbox on is not YOLO.
- Harness writes `authorizerChain` itself. Settings does not expose a generic chain editor.
- Electron main must not dynamically import `@gotgenes/pi-permission-system`. The published `Symbol.for` slot is the public cross-isolate contract and survives both jiti isolation and the electron-vite bundle.

## Verification

macOS arm64, 2026-08-17. Isolated temp agent/workspace/userData. Not packaged.

- **unit verified:** `bun run typecheck` — pass. `bun run lint` — 0 errors (4 pre-existing `react-hooks/exhaustive-deps` warnings in `App.tsx` and `context-prompt-dialog.tsx`). `bun test packages/runtime/test/sandbox-permission.test.ts packages/runtime/test/permission-settings.test.ts` — pass, including global-slot registration without a runtime package import.
- **integration verified:** `bun test packages/runtime/test/sandbox-permission-runtime.test.ts packages/runtime/test/sandbox-settings-runtime.test.ts packages/runtime/test/developer-runtime.test.ts` — pass. Balanced: healthy `pwd` with no dialog; workspace `rm` denied with Trash reason; curl is a tool error; `write` still asks; guarded/developer `pwd` also skip; disable restores wrapper ask.
- **desktop verified:** `bun run --filter @pho-code/desktop build` then `cd apps/desktop && bunx playwright test tests/sandbox.spec.ts` — pass (11.7s). Bundled `out/main/main.js` contains `Symbol.for("@gotgenes/pi-permission-system:service")` and does not `import("@gotgenes/pi-permission-system")` from the skip-ask path. Enable → Healthy; sandboxed `pwd`/`touch`/`curl` with no permission dock; disable restores Allow once.
- **packaged:** not verified. Milestone 4.

`git diff --check` — clean.

## Mistakes and corrections

Dynamic `import("@gotgenes/pi-permission-system")` stayed external in electron-vite’s main bundle. Electron could not resolve that package from `out/main/`, the `.catch()` swallowed the failure, and skip-ask never registered. Node/Bun tests passed because they resolve the workspace package. Correction: read the documented `Symbol.for` slot in harness code so registration does not depend on a runtime import of the permission package.

## Owner feedback

None yet.

## UI impact

No new chrome. Healthy sandbox stops the permission dock for in-box bash. Disable restores Allow once / deny as today.

## Blockers and handoff

Not accepted. File-tool policy is Milestone 3. Packaged staging is Milestone 4. See [`2026-08-17-m4-packaged-macos.md`](./2026-08-17-m4-packaged-macos.md).
