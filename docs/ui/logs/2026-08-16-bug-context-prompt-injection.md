# Context prompt did not reach the model

Kind: bug  
Status: implemented  
Surface: Context prompt / first-turn system prompt  
Owner: ui/conversation chrome  
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)  
Related logs: none

## Expected / actual (before)

Expected: Save on an empty chat compiles preamble **A**, and the first user message is answered under that system prompt (for example a custom name/persona).

Actual: the panel showed **Custom** and froze after send, but the model still answered as pi. The compiled entry was persisted; it was never injected.

## Reproduction / evidence

Owner saved a custom preamble (`You're name is Bevy…`), turned context files and tools off, then asked “What is your name?” The assistant identified as pi.

Root cause: `createContextPromptExtension` read `bindingKeyId()` inside the Pi factory and returned without registering `before_agent_start` when the key was missing. Pi invokes factories during `DefaultResourceLoader.reload()`, which happens while constructing the session, before `bindHostUi` sets a session key. `bindExtensions` does not re-run factories.

## Changes and decisions

- The factory always registers `before_agent_start`.
- At run start it looks up compiled A from the live session (`ctx.cwd` + `sessionManager.getSessionId()`), with a session-id fallback if the cwd encoding differs from the stored key.
- Bind-time `bindingKey` plumbing was removed; it could not observe the factory and was cleared before the hook would fire anyway.

## Verification

- Unit verified: `bun test packages/runtime/test/context-prompt-feature.test.ts packages/runtime/test/context-prompt.test.ts` — 7 pass
- Integration verified: `bun test packages/runtime/test/pi-runtime.test.ts --test-name-pattern "customizes context prompt"` — 1 pass (persist/freeze/reopen). Deterministic model uses `systemPromptOverride`, so provider-payload injection is proven by the factory unit test
- `bun run typecheck` — pass
- `bun run lint` — 0 errors; 4 pre-existing `react-hooks/exhaustive-deps` warnings
- Desktop: not run; runtime hook only

## Owner feedback

The custom system prompt feature did not work; the model ignored the saved Bevy preamble.

## Mistakes and corrections

Earlier coverage asserted JSONL persistence and inspect-only freeze, not that `before_agent_start` was registered or that compiled A replaced Pi’s default prompt.

## Handoff

Owner should retry on a **new empty session**: Save the preamble before the first message, then ask the model its name. Frozen inspect-only after send is expected; the reply should follow A.
