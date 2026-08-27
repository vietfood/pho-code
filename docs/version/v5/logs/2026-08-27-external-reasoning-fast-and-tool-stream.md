# External reasoning, Fast mode, and tool streaming

Status: implemented; focused unit/integration verified; real provider and packaged verification pending

Owner: V5 B2a/B3a/B4

Related UI record: [`../../../ui/logs/2026-08-27-change-external-reasoning-and-fast.md`](../../../ui/logs/2026-08-27-change-external-reasoning-and-fast.md)

## Owner feedback

The owner asked for backend thinking choices such as low and medium, a distinct Fast mode for Codex or Claude, and smoother live tool output. The owner also asked whether Codex currently uses Pho Code's Pi tools and system prompt.

## Contract and implementation

Pho Agent now carries optional backend-owned reasoning choices/current selection, Fast-mode state, setters for both, and incremental tool-update events. Pho Code projects supported reasoning IDs into its existing thinking selector, shows a separate Fast toggle only when the current backend/model advertises it, and maps incremental tool updates into the existing keyed live-run store rather than rebuilding the transcript snapshot for each output chunk.

Codex discovers `defaultReasoningEffort`, `supportedReasoningEfforts`, and `serviceTiers` from `model/list`. The selected reasoning effort and `fast` service tier are sent as `effort` and `serviceTier` on `turn/start`; disabling Fast sends a null tier override so the session does not remain sticky-fast. `item/commandExecution/outputDelta` is accumulated into the live command block in order, while completed items/turns remain authoritative.

ACP projects stable select config in the `thought_level` category and the fixed Claude bridge's `fast` select option. Changes use `session/set_config_option`; sessions that do not advertise these options expose no control. The ACP client advertises the bridge's terminal-output metadata capability, and tool-call, tool-call-update, and terminal-output chunks now become incremental tool events, with the final prompt settlement snapshot authoritative.

## Prompt and tool ownership decision

Codex still owns its agent loop, built-in tools, workspace-instruction loading, skills, MCP configuration, and persistence. Pho Code does not pass the Pi-compiled context prompt or Pi baked tools to Codex or ACP. Codex App Server supports thread `developerInstructions` and experimental `dynamicTools`, but those are not drop-in Pi features: a dynamic-tool bridge needs a reviewed schema allowlist, execution owner, permissions, cancellation, result bounds, and backend/session/run attribution. A future slice may define backend-neutral session instructions and a curated dynamic-tool adapter; it must not silently treat Pi's system prompt or tool implementation as portable.

This follows the [official App Server contract](https://developers.openai.com/codex/app-server) for model reasoning metadata, turn effort overrides, streamed item output, and dynamic tools, plus the [official Codex speed contract](https://learn.chatgpt.com/docs/agent-configuration/speed), where Fast is a service tier rather than a reasoning level. ACP behavior is derived from the installed exact `@agentclientprotocol/sdk` `1.4.0` stable types and the installed `claude-agent-acp` `0.70.0` session config implementation.

## Verification

- Pho Agent typecheck passed across all packages.
- Focused Codex and ACP adapter tests: 9 passed.
- Root typecheck passed across all Pho Agent and Pho Code packages.
- Focused Pho Code protocol/runtime/UI tests: 52 passed.
- Root lint passed with no errors and 9 pre-existing React hook warnings; the desktop production build passed.
- Focused Electron composer/backend and typed-bridge smoke checks passed one test each. The first smoke attempt exposed only an incorrectly ordered expected key; the expected list was corrected and the unchanged check then passed.
- Real Codex/Claude provider journeys remain pending.

## Handoff

Real Codex verification should confirm the advertised effort ladder, toggle Fast for a supported model, and run a command with multiple output chunks. Real Claude ACP verification requires a compatible external `claude-agent-acp` executable and provider credentials. The system-prompt/dynamic-tool bridge remains an explicit later design slice, not an implied parity claim.
