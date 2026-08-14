# V2 Milestone 4 acceptance review

Date: 2026-08-14  
Decision: accepted for the personal-v2 boundary

## Accepted outcome

Milestone 4 ships two bounded capability families:

- three Pho Code-authored Markdown-only skills plus fixed, owner-enabled Codex, Cursor, Claude, and Pi user-skill sources with provenance, compatibility diagnostics, Refresh, and on-demand `/` or named loading;
- one Settings-controlled, PAT-authenticated GitHub MCP server pinned to `github/github-mcp-server` `1.9.0`, running locally over stdio in read-only and lockdown modes with a source-controlled read allowlist.

This does not admit project skill discovery, executable skill assets, arbitrary skill roots, `.mcp.json`, arbitrary servers, runtime downloads, GitHub OAuth, browser credentials, `gh` credentials, or GitHub mutations.

## Final review corrections

The closure review found and corrected five issues:

1. Keychain and Secret Service deletion failures now reject Remove PAT instead of falsely clearing UI/runtime state.
2. The GitHub adapter registers one fixed `mcp` dispatcher with `server: "github"` and an allowlisted operation enum, so the pinned permission system's `mcp` policy and qualified session approvals actually govern calls.
3. A binding revision refreshes protected session controllers after their active run settles; a subsequent prompt retries a failed refresh, preventing stale tool exposure after enable/disable or PAT changes.
4. Replacing a PAT clears the cached account login until the new credential successfully resolves its identity.
5. Skill admission checks the resolved `SKILL.md` target size and uses fatal UTF-8 decoding, closing symlink-size and malformed-text bypasses.

The review also updated the stale package-boundary expectation for the already reviewed MCP SDK and Cursor SDK runtime dependencies.

## Verification executed

```text
bun run typecheck
PASS — protocol, UI, runtime, application, and desktop packages

bun test packages/runtime/test/secret-store.test.ts packages/runtime/test/skill-source.test.ts packages/runtime/test/github-mcp-runtime.test.ts
PASS — 26 tests

bun test
PASS — 431 tests across 92 files
```

The complete suite covers artifact hash refusal, fixed skill-source discovery, path escapes, PAT redaction and persistence semantics, allowlist/write-tool refusal, bounded MCP output, exact-child lifecycle through the fake stdio server, settings/protocol secrecy, package boundaries, and the earlier v2 milestones.

## Verification boundaries

- Unit/integration verified: the checks above.
- Previously accepted desktop/packaged evidence: permissions and Trash, retrieval, provider OAuth, chat continuity, archive/restore, and settled chat removal.
- Present but not rerun during closure: the staged `darwin-arm64` GitHub MCP binary and development resource path.
- Not independently verified in this closure: a live GitHub PAT workflow, Linux native artifact/Secret Service desktop behavior, signed/notarized distribution, update/rollback, hostile local-process containment, or public threat response.

The owner directed archival after reviewing the Milestone 4 implementation. Those remaining items belong to the future public-release phase and must be verified before Pho Code is represented as ready for general distribution.

## Decision

Milestone 4 and personal v2 are accepted. The immutable reviewed-feature model remains intact, permanent deletion remains unavailable, GitHub mutation remains structurally absent, secrets do not cross into renderer snapshots, and the known verification boundary is explicit. The active planning surface is now the future-release roadmap.
