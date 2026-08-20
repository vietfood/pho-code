# Settings GitHub MCP: shorter disclosure

Kind: change  
Status: in source  
Surface: floating Settings dialog, GitHub MCP section  
Owner: ui/settings chrome (copy host); accepted v2 Milestone 4 (policy)  
Owning plan: [`../../archive/v2/implementation-plan-v2.md`](../../archive/v2/implementation-plan-v2.md)  
Related logs: [`2026-08-16-change-verbose-pane-copy.md`](./2026-08-16-change-verbose-pane-copy.md)

## Intended change

Match Skills Settings voice: a short “what this is / is not” paragraph, then a list of what enabling does. Drop duplicated PAT/OAuth/secret-store sentences that the token row and platform notice already cover.

## Expected / actual (before)

Expected: GitHub MCP copy tells what enabling does, at Skills length.  
Actual: a seven-sentence paragraph covering lockdown mode, tool inventory, writes, untrusted content, PAT/OAuth, disable vs Remove PAT, and permission-dialog honesty.

## Changes and decisions

- `GITHUB_MCP_TRUST_NOTICE` follows the Skills pattern: packaged read-only server, not a sandbox; enable starts one server and binds reviewed read tools; GitHub content is untrusted remote text and is never executed as Pho Code instructions; permission dialogs still ask before reads.
- `GITHUB_MCP_DISCLOSURE_ITEMS` lists the read surface, unavailable write actions, and Disable vs Remove PAT.
- Settings renders the notice plus a disc list. Enable confirmation still uses the joined `disclosure` snapshot string.
- PAT storage and Keychain/keyring honesty stay on `GITHUB_MCP_SECRET_STORE_NOTICE`. No GitHub OAuth remains a product non-goal, not Settings chrome.

## Verification

- **unit verified:** `bun test packages/protocol/test/github-mcp.test.ts packages/ui/test/github-mcp-settings.test.ts packages/runtime/test/github-mcp-runtime.test.ts` — 19 pass.
- **typecheck verified:** `bun run --filter @pho-code/protocol --filter @pho-code/ui typecheck` — both exited 0.
- **desktop:** not run; Settings copy and list markup only, no IPC or renderer contract change.

## Mistakes / corrections

None yet.

## Owner feedback

Rewrite more concise; tell what it does; use listings; same voice as Skills.

## Handoff

Policy is unchanged: one packaged read-only GitHub MCP, PAT in the OS secret store, allowlisted reads, no write tools.
