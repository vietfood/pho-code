# Codex interaction dock

Date: 2026-08-26
Status: in source; existing dock desktop behavior and focused backend projection verified
Surface: conversation approval/questionnaire dock
Owner: V5 Pho Agent Foundation B2b
Owning record: [`../../version/v5/logs/2026-08-26-codex-owner-interactions.md`](../../version/v5/logs/2026-08-26-codex-owner-interactions.md)

## Change

Codex command, file-change, and additional-permission requests reuse the existing compact select approval card. Codex `request_user_input` reuses the existing questionnaire card. No backend-specific modal, dashboard, raw JSON-RPC payload, or long disclosure was added to the conversation.

The generic ACP adapter now sends stable `session/request_permission` choices through the same approval card and returns the selected opaque option ID. ACP itself is not yet production-composed in Pho Code.

The dialog request and resolution retain backend, workspace, session, run, and opaque request ownership across the privileged boundary. Display labels such as Allow once are mapped back to adapter-owned decision values in the runtime, not interpreted by the renderer.

## Safety and limitations

Secret questions are not displayed in the current non-secret questionnaire control. Unsupported Codex server request methods fail closed. MCP elicitation and backend auth require separate bounded UI contracts.

## Verification

- Existing host-dialog UI tests remain green.
- Focused hosted-runtime integration proves a Codex approval becomes an existing `HostDialogRequest`, resolves from label to backend decision, and keeps backend identity.
- A real provider-backed Codex approval was not used; the current evidence is integration plus the existing Electron dock lane.
