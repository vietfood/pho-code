# Phase 1: Qualify ChatGPT subscription OAuth and Codex transport

- Status: **STOP — FROZEN**; deterministic and macOS-local implementation complete, no live qualification run
- Depends on: [Phase 0](phase-0-foundation.md)
- Produces: Qualified authentication actor, direct backend transport, sanitized fixtures, and a go/stop record
- Successor: [Phase 1B DeepSeek API qualification](phase-1b-deepseek-api-qualification.md)

## Why this phase is detailed

ChatGPT subscription access is the practical reason for the first backend and the least stable boundary in the product. A weaker executor should be able to implement this phase without inventing identity, credential, retry, replay, or validation policy. This file therefore owns the ordered work and evidence checklist; [the backend architecture](../../architecture/chatgpt-codex-backend.md) remains the single source for required behavior.

Do not proceed to Phase 2 merely because a copied Pi request succeeds. Phase 1 passes only when Pho Code uses an accepted client identity, truthful product metadata, its own Keychain record, and a deterministic direct-stream contract.

## Final outcome

This phase did not pass. On 2026-07-14 Pho Code had no authoritative public OAuth client identity that could represent itself truthfully, so the live procedure was not run. That is the explicit ADR 0002 stop condition the phase was designed to detect. [ADR 0003](../../decisions/0003-deepseek-api-first-backend.md) freezes this path and makes [Phase 1B](phase-1b-deepseek-api-qualification.md) the new gate before Phase 2.

The remaining plan is preserved as implementation and decision evidence. It is inactive and must not be resumed without a new decision establishing a supported client identity.

## Required reading

Read these completely before implementation:

1. [ADR 0002](../../decisions/0002-native-agent-harness.md), especially the unsupported-contract consequence and reassessment rule.
2. [ChatGPT Codex backend architecture](../../architecture/chatgpt-codex-backend.md).
3. [Native harness system](../../architecture/native-harness-system.md), especially actor ownership and normalized events.
4. [Pi source study](../../research/pi-source-study.md), following its OAuth, credential, request, stream, and tool-call source links.
5. Official [Codex authentication documentation](https://learn.chatgpt.com/docs/auth) and [OpenAI API authentication overview](https://developers.openai.com/api/reference/overview#authentication) for the documented support boundary.
6. [Qualification record index](../../qualification/README.md) for the dated evidence and current-pointer contract.

The checked-out source is behavior evidence. Do not copy Pi's originator, user agent, credential file, or model catalog and do not import Codex credentials.

## Phase outputs

The phase must leave all of these artifacts:

- production-shaped `auth` and `backend::chatgpt_codex` modules behind narrow crate-private boundaries;
- a deterministic credential-store fake and macOS Keychain adapter;
- an OS-released single-instance guard acquired before Keychain access;
- an incremental bounded SSE decoder and provider-event mapper;
- candidate serializable DTOs for required opaque replay state and provider identities;
- sanitized deterministic OAuth, token, HTTP, SSE, replay, and error fixtures;
- a developer-only headless compatibility probe with no filesystem or shell tool;
- an explicit live-qualified model allowlist containing at least one successful model, or a stop decision;
- a dated compatibility record under `docs/qualification/` with no sensitive captured values.

## Implementation ownership

Recommended module ownership follows the system architecture:

```text
src/app/
  instance_lock.rs    process-lifetime single-instance guard owned by the shell

src/auth/
  mod.rs              actor API and public authentication state
  oauth.rs            PKCE, authorization URL, callback/manual parsing, exchange/refresh DTOs
  keychain.rs         Pho Code Keychain record

src/backend/
  mod.rs              normalized backend request/event interface
  chatgpt_codex.rs    request construction and provider mapping
  sse.rs              bounded byte framing and JSON event decoding
  profile.rs          candidate and live-qualified compatibility metadata
  scripted.rs         Phase 0 deterministic implementation

tests/fixtures/
  oauth/
  codex_sse/
```

Names may change to fit the codebase, but OAuth state, raw credentials, provider DTOs, and SSE structs must not leak into GPUI views or the generic loop.

## Work sequence

### 1. Freeze an evidence matrix

Before sending a live request, create a table in the dated qualification draft or a focused test-data note with one row per compatibility assumption:

- OAuth issuer and authorization/token/device endpoints;
- client identifier provenance, callback URI, scopes, and Codex-specific query parameters;
- PKCE verifier/challenge and state encoding;
- callback and manual-input formats;
- token and refresh response fields, rotation, expiry, and account-routing extraction;
- direct backend base/path;
- required headers and truthful Pho Code originator/user agent;
- minimum request fields, tool schema, reasoning summary and opaque replay fields;
- SSE item, delta, usage, incomplete, failure, and terminal events;
- candidate model identifiers and observed capabilities.

Each row must link Pi or Codex source, state the Pho Code decision or open question, name its deterministic test, and reserve a live-validation result. Do not store a literal token, account ID, authorization URL containing live state, or raw captured request.

### 2. Define secret-safe domain types and errors

- Implement a versioned credential bundle containing only the fields required by [credential custody](../../architecture/chatgpt-codex-backend.md#credential-custody-and-refresh).
- Prevent access token, refresh token, authorization code, PKCE verifier, raw header map, and live account identifier from appearing through `Debug`, `Display`, error source chains, tracing fields, or snapshots.
- Distinguish login failure, temporary refresh unavailability, reauthentication required, backend entitlement rejection, client identity rejection, malformed credentials, and Keychain failure.
- Inject clock and randomness into deterministic tests; production uses cryptographically secure randomness and UTC expiry.
- Bound every parsed URL, callback input, token field, claim, header value, error body, frame, event, and opaque replay value before allocation or retention grows without limit.

Do not build a generalized provider error hierarchy. Implement the concrete categories required by [the backend error taxonomy](../../architecture/chatgpt-codex-backend.md#errors-and-diagnostics).

### 3. Implement browser PKCE without the live service

Implement and test the browser flow described by [the authentication profile](../../architecture/chatgpt-codex-backend.md#authentication-profile):

1. Generate independent high-entropy verifier and state values.
2. Derive an S256 challenge with audited primitives.
3. Bind the tested fixed callback to IPv4 loopback before opening the browser.
4. Open only the allowlisted HTTPS authorization origin through a platform API, never through shell interpolation.
5. Accept only the configured callback path and one terminal result.
6. Validate state, code cardinality, explicit OAuth errors, size, and percent encoding.
7. Race callback and manual input through one completion primitive.
8. Close the listener and destroy transient material on completion, timeout, cancellation, or failure.
9. Return a static callback page without sensitive values.

The manual fallback accepts the active flow's full redirect URL or exact code. When state is present it must match; a bare code requires an explicit warning because it cannot prove copied state. Manual input is bounded, single-use, cleared from application state, and never journaled.

Test at least success, wrong path, state mismatch, missing code, conflicting duplicate code, explicit OAuth denial, malformed URL, occupied port, listener failure, callback/manual race, duplicate callback, timeout, cancellation at each stage, and late callback after cancellation.

### 4. Implement Keychain custody behind the shell-owned single-instance guard

- Have the application shell acquire and retain an OS-released advisory lock in Pho Code's Application Support namespace before it constructs the authentication actor or any session actor.
- Require the authentication actor's construction path to prove the process guard is already held; the actor never acquires or releases the process-lifetime guard itself.
- A second process must report the existing instance and stop before credential access.
- A normally exited or forcibly terminated owner must release the lock through OS handle semantics rather than cleanup code alone.
- Use a Pho Code-specific Keychain service and account slot; never inspect Pi or Codex storage.
- Replace the complete versioned bundle as one logical Keychain update.
- Never fall back to plaintext storage.
- Logout removes the active in-memory lease and Keychain record; deletion failure is visible and does not leave the record leasable.

Use a fake credential store for most state tests. Real Keychain checks are local-component/macOS evidence and must use a dedicated nonproduction service suffix during automated development tests.

Test first launch, missing item, valid item, malformed version, denied Keychain access, write failure, delete failure, second process, owner crash, and no secret marker in errors.

### 5. Implement exchange, refresh, and account routing

- Send form-encoded authorization-code and refresh exchanges according to the qualified profile.
- Validate the complete token response before committing anything.
- Decode only the bounded claim needed for account routing and treat it as unverified metadata.
- Refresh before expiry using a conservative skew.
- Serialize all leases, refresh, write, and logout through one actor.
- Persist a rotated refresh token before leasing the new access token.
- On transient refresh failure, retain the Keychain record, stop leasing an expired access token, and enter `TemporarilyUnavailable`.
- On authoritative invalid grant, revocation, or missing refresh token, quarantine the bundle, attempt Keychain removal, and enter `ReauthenticationRequired`.
- Keep an otherwise valid credential after backend entitlement or client-profile rejection; those are compatibility errors, not proof of token revocation.

Remote rotation and local Keychain commit cannot be atomic. Inject failure after a successful server rotation and before local commit, and verify that Pho Code requires reauthentication rather than pretending the previous refresh token still works.

### 6. Implement the bounded SSE decoder

The decoder accepts arbitrary byte chunks and emits normalized events defined by [the backend event contract](../../architecture/chatgpt-codex-backend.md#sse-decoding-and-normalized-events). It must not know about GPUI, execute tools, write sessions, or own retry policy.

Cover these framing cases before live use:

- LF and CRLF delimiters;
- one-byte fragmentation including split UTF-8;
- multiple `data:` lines, comments, empty frames, and final buffered bytes;
- malformed UTF-8 and JSON;
- missing event type or required identity;
- configured line, frame, event-count, open-item-count, per-item-byte, aggregate-response, retained-diagnostic, total-duration, and idle-duration limits;
- sustained valid small-delta flood and slow-stream timeout;
- text, reasoning summary, tool-argument, item completion, usage, completed, incomplete, and failed events;
- unknown well-formed optional events;
- duplicate terminal, late delta, item-kind mismatch, and EOF without a terminal response.

A `[DONE]` marker ends framing but is not successful completion without the required terminal provider event. Tool arguments remain non-executable bytes until provider completion, strict JSON parsing, and local schema validation in later phases.

### 7. Build the no-tool live probe

The probe must use the real authentication actor and concrete backend while remaining outside GPUI. Its first request contains a nonsecret prompt, no tools, `store: false`, streaming enabled, the smallest qualified body, truthful Pho Code metadata, a stable session identifier, and a unique request identifier.

Default diagnostics retain only status class, safe provider error code, local/request identifiers when nonsecret, event-type sequence, byte counts, timing, and terminal classification. They exclude body text, prompt, headers, tokens, account ID, callback data, and opaque replay values.

Exercise and record:

- successful browser login;
- credential reuse after process restart;
- one streamed text response;
- provider-exposed reasoning summary when the model supplies one;
- cancellation after stream start;
- one classified rejection or compatibility failure without dumping its raw body.

No model request is automatically retried. One terminal pre-SSE authentication rejection may cause one serialized refresh and replay only before an SSE response is accepted or any provider event/side effect exists. Delivery after request bytes but before response headers is `DeliveryUnknown` unless a later qualified idempotency contract proves otherwise.

### 8. Prove full-history and tool-call continuation

Add one harmless in-memory function tool. It must not read files, execute a process, or mutate the workspace.

1. Send the qualified fixed tool schema with parallel calls disabled.
2. Assemble fragmented arguments by output/call identity under a hard limit.
3. Wait for the completed provider item.
4. Parse strict JSON and validate the local schema without repair.
5. Create a deterministic in-memory result.
6. Reconstruct full retained history with the exact call ID, item ID, assistant phase, result pairing, and required opaque reasoning replay state.
7. Send the continuation and receive a terminal assistant response.
8. Round-trip completed backend replay metadata through the candidate serializable DTO.

Synthetic opaque values belong in committed deterministic fixtures. Live opaque replay values may exist only in bounded runtime/session provider metadata; they must not appear in logs, UI, qualification captures, or committed live-derived fixtures. Phase 5 proves the final JSONL representation.

Test cancellation and incomplete/length/failure terminal states during argument streaming and prove no tool result is produced.

### 9. Qualify the first model profile

- Form a tiny candidate probe set from pinned source evidence.
- A source-listed model is not allowlisted.
- Promote a model only after browser login, text streaming, tool-call/result continuation, replay, and cancellation succeed for the selected account/profile.
- Record reasoning efforts exercised, tool support, required request fields, observed context information, and qualification date.
- Pin a session to one model; do not design mid-session switching.
- Do not display API token pricing for subscription use.

### 10. Decide device authorization

Fixture-test Pi's observed device states even if no V1 UI is built: authorization pending, slow down, success, denial, expiry, malformed response, total deadline, and cancellation. Do not treat every 403/404 as pending.

Implement and expose the real device flow only if browser PKCE plus manual fallback is inadequate on a supported macOS use case and the same accepted Pho Code client identity can use the device endpoints. Record “not implemented; browser path sufficient” as a valid result.

### 11. Write the live qualification record

Create `docs/qualification/chatgpt-codex-YYYY-MM-DD.md` containing:

- Pho Code and audited Pi revisions;
- macOS version and architecture;
- account plan class without personal identity;
- login path exercised and fallback/device result;
- accepted truthful originator/user-agent and client-identity provenance without literal credentials;
- Keychain reuse, refresh or controlled equivalent, logout, and single-instance results;
- selected model/profile and event types observed;
- text, reasoning-when-present, tool continuation, replay, cancellation, and classified-error results;
- deviations from Pi and official documentation;
- remaining assumptions;
- final `PASS` or `STOP` decision.

When the record says `PASS`, update both qualification-index pointers: latest observation/status and latest passing profile. A `STOP`, expiry, or invalidation updates only latest observation/status, preserves the historical last passing profile, and blocks Phase 3 until another `PASS`.

Do not include live account IDs, email, tokens, codes, verifier/state/challenge values, authorization URLs with query parameters, prompts/responses, raw traffic, tool arguments, or opaque replay values.

## Deterministic test matrix

The phase is not complete without named tests for:

| Area | Minimum cases |
| --- | --- |
| PKCE/callback | deterministic verifier/challenge, state, success, hostile input, race, timeout, cancellation, port conflict |
| Token actor | success, missing fields, refresh skew, concurrent lease, rotation, transient failure, invalid grant, logout race |
| Keychain/lock | read/write/delete failure, malformed version, second process rejection, owner-crash release |
| Account routing | missing, malformed, oversized, decoded-but-unverified claim |
| SSE | byte fragmentation, CRLF, multiline, comments, malformed/oversized, unknown, duplicate/late, abrupt EOF, small-delta/event flood, open-item/per-item/aggregate overflow, total and idle timeout |
| Mapping | text, reasoning summary, tool arguments, usage, completed, incomplete, failed, cancelled |
| Replay | complete history, exact call/result identities, opaque DTO round-trip, missing replay state |
| Ambiguity | failure before send, after send/before headers, terminal pre-stream auth rejection, accepted stream, cancellation races |
| Redaction | every seeded secret/content marker absent from logs, errors, qualification output, and committed live-derived fixtures |

## Required checks

Run focused tests throughout, then the repository baseline in [AGENTS.md](../../../AGENTS.md#build-and-test-workflow). Live tests are opt-in and must obtain credentials only through the real actor/Keychain flow. A skipped live test does not satisfy this gate.

## Hard gate

Phase 1 passes only when:

1. Browser PKCE, manual fallback, cancellation, refresh, logout, redaction, and the single-instance guard pass deterministic and macOS component tests.
2. A real browser login and post-restart credential reuse succeed with an accepted client identity and truthful Pho Code product metadata.
3. At least one model completes text streaming and a full-history in-memory tool-call/result continuation.
4. SSE terminal, failure, cancellation, and delivery-ambiguity semantics are fixture-tested.
5. Required provider identities and opaque replay data round-trip through the candidate backend DTO without being rendered or logged.
6. The dated record evaluates every stop condition and says `PASS`, and both qualification-index pointers link that current passing observation/profile.

Stop and revisit ADR 0002 if success requires Pi/Codex impersonation, another application's credential store, an undistributable secret, unsafe token exposure, unavailable tool calling, missing deterministic replay identities, required server-stored thread state, or an authoritative policy that makes the integration inappropriate. Do not hide the failure behind a compatibility header or copied user agent.
