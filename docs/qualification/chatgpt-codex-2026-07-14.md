# ChatGPT Codex compatibility qualification — 2026-07-14

- Status: **STOP — FROZEN; deterministic implementation only, live gate not run**
- Pho Code revision: Uncommitted Phase 0/1 implementation batch
- Audited Pi revision: `0e6909f050eeb15e8f6c05185511f3788357ddb3`
- Platform: macOS; exact live-test version and architecture not recorded because no live run occurred
- Account class: Not recorded; no live account was used
- Final decision: **STOP** for this backend; [Phase 1B](../implementation/v1/phase-1b-deepseek-api-qualification.md) replaces this gate

This is the final Phase 1 stop record. It preserves the deterministic evidence matrix and intentionally contains no client secret, account identifier, authorization URL, prompt or response content, raw traffic, tool arguments, or opaque replay value. No live request was run because accepted client-identity provenance could not be established.

## Evidence matrix

| Assumption | Source evidence | Pho Code implementation or open question | Deterministic evidence | Live result |
| --- | --- | --- | --- | --- |
| Authorization and token endpoints | [Pi OAuth study](../research/pi-source-study.md#oauth-constants-and-modes) | Endpoints are supplied by a bounded developer candidate profile; no endpoint is promoted to a production constant before qualification | Candidate profile rejects non-HTTPS remote endpoints | Not run; stopped before live traffic |
| Public client identity | [Backend support posture](../architecture/chatgpt-codex-backend.md#support-and-uncertainty-posture) | Accepted Pho Code client-ID provenance remains unresolved; the implementation never commits or claims Pi/Codex identity | Candidate profile requires a bounded nonempty ID and truthful `originator = pho-code` | **STOP**; authorized identity provenance unavailable |
| Callback URI and scopes | [Authentication profile](../architecture/chatgpt-codex-backend.md#authentication-profile) | Fixed IPv4 loopback callback; candidate scopes are explicit | Exact origin/path/port, duplicate code, state, hostile input, cancellation, and limits tested | Not run; stopped before live traffic |
| PKCE and state | [Phase 1 browser work](../implementation/v1/phase-1-chatgpt-codex-qualification.md#3-implement-browser-pkce-without-the-live-service) | Independent 32-byte OS-random verifier and state; S256 | RFC 7636 vector and callback validation tests | Not run; stopped before live traffic |
| Keychain and process ownership | [Credential custody](../architecture/chatgpt-codex-backend.md#credential-custody-and-refresh) | Versioned bundle in Pho Code namespace; actor construction requires the shell-held advisory guard | In-memory lifecycle, second-owner, refresh serialization, invalid-grant, and opt-in Keychain tests | Not run with a live credential |
| Refresh rotation and expiry | [Serialized refresh](../architecture/chatgpt-codex-backend.md#serialized-refresh) | Five-minute skew; replacement persists before a new lease; invalid rotation commit requires reauthentication | Concurrent lease, transient failure, and invalid-grant tests | Not run with a live credential |
| Account routing | [Account extraction](../architecture/chatgpt-codex-backend.md#account-identifier-extraction) | Bounded unverified JWT metadata extraction; service remains authority | Missing, malformed, oversized, and synthetic namespaced claim tests | Not run with a live credential |
| Backend endpoint and headers | [Direct transport](../architecture/chatgpt-codex-backend.md#direct-responses-transport) | HTTPS endpoint from candidate profile; redirects disabled; truthful originator/user agent; no arbitrary headers | Request-shape and status-classification tests; secrets excluded from `Debug` and errors | Not run; stopped before live traffic |
| Minimum request body | [Request body](../architecture/chatgpt-codex-backend.md#request-body) | `store:false`, SSE, full input, encrypted reasoning include, sequential tools | Wire-shape tests | Not run; stopped before live traffic |
| SSE events and limits | [SSE contract](../architecture/chatgpt-codex-backend.md#sse-decoding-and-normalized-events) | Incremental CRLF/LF decoder with line, frame, item, aggregate, and event bounds | One-byte UTF-8 fragmentation, malformed/oversized, item lifecycle, duplicate terminal, and abrupt EOF tests | Not run; fixtures only |
| Full-history tool continuation | [Full-history continuation](../architecture/chatgpt-codex-backend.md#full-history-continuation) | Probe validates one fixed in-memory tool and replays exact item/call IDs plus opaque reasoning metadata | Wire DTO round-trip and scripted tests | Not run; fixtures only |
| Delivery and retry | [Retry classes](../architecture/chatgpt-codex-backend.md#retry-classes) | No model retry; pre-header send failure is `DeliveryUnknown`; post-event loss is ambiguous | Status, EOF, cancellation stage, and terminal tests | Not run; fixtures only |
| Candidate model | [Model allowlist](../architecture/chatgpt-codex-backend.md#model-compatibility-and-allowlist) | No model is allowlisted yet | Candidate field is bounded | Not run; no model qualified |
| Device authorization | [Device authorization](../architecture/chatgpt-codex-backend.md#device-authorization) | Real flow is not exposed unless browser plus manual fallback proves insufficient | Pending, slow-down, success shape, denial, expiry, malformed response tests | Not run; phase frozen |

## Deterministic implementation result

- Browser PKCE primitives, callback/manual parsing, loopback listener, bounded token exchange, credential actor, Keychain adapter, and single-instance guard are implemented.
- Incremental SSE framing, normalized events, opaque replay DTO, concrete direct backend, and a developer-only no-filesystem/no-shell compatibility probe are implemented.
- The probe reports only event counts, content byte counts, terminal classification, and completed tool-call count. It does not print model content or sensitive transport state.
- `tests/fixtures/**` contains synthetic data only.

## Official support-boundary check

The current official [Codex authentication documentation](https://learn.chatgpt.com/docs/auth#openai-authentication) documents ChatGPT subscription sign-in for the ChatGPT desktop app, Codex CLI, and IDE extension. It does not publish a third-party native-app client registration or state that another product may reuse one of those surfaces' OAuth identities.

The current [OpenAI API authentication reference](https://developers.openai.com/api/reference/overview#authentication) documents API keys and short-lived workload-identity access tokens for general API requests. It does not document ChatGPT subscription OAuth as a general application authentication mechanism.

Therefore the live probe stopped on accepted Pho Code client-identity provenance. This satisfied an ADR 0002 compatibility stop condition; Pho Code did not substitute Pi/Codex metadata or silently treat another authentication contract as equivalent. [ADR 0003](../decisions/0003-deepseek-api-first-backend.md) records the separate DeepSeek API pivot.

## Inactive historical live procedure

The procedure below was never run and is retained only to show what the former gate required. It is not current work and must not be executed without a superseding decision that reauthorizes the backend.

1. Establish an accepted public-client-compatible client identifier for Pho Code without product impersonation or an undistributable secret.
2. Copy `tests/fixtures/oauth/candidate-profile.example.json` outside the repository, fill only the nonsecret candidate profile, and run `cargo run --bin phase1_probe -- run <profile-path>`.
3. Run the probe twice to establish browser login and post-restart Keychain reuse.
4. Run the opt-in development Keychain component check and record macOS/architecture results.
5. Exercise cancellation after stream start and a classified rejection without retaining raw bodies.
6. Run `cargo run --bin phase1_probe -- logout <profile-path>` and verify the credential is no longer leasable.
7. Replace this pending section with sanitized observations and evaluate every ADR 0002 stop condition.

This record can never become a passing DeepSeek profile. Current qualification status lives in [the qualification index](README.md).
