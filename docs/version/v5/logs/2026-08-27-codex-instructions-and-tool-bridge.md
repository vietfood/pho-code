# Codex instructions and curated tool bridge

Date: 2026-08-27

Status: implemented and focused verified; owner provider verification recorded; V5 not accepted

Owner: V5 B2a/B3b/B4

## Owner evidence

The owner reported that Codex and Claude both work well through the Pho Code desktop. This is recorded as owner-verified ordinary installed-command initialization and provider-backed prompting for both backends. The report does not by itself prove every approval, resume, GUI `PATH`, cancellation, packaged, or evaluation journey.

## Contract

Codex remains authoritative for its agent loop, built-in tools, workspace instructions, skills, MCP configuration, and persistence. Pho Code now supplies a short bounded `developerInstructions` string on new and resumed Codex threads to identify the host and state the feature-ownership boundary. It does not reuse the editable Pi context prompt.

New Codex threads advertise one product-owned experimental dynamic tool: `pho_search_workspace_references`. The tool searches Pho Code's existing local index for workspace-relative file/folder paths. Its JSON schema rejects extra properties, inputs are validated and clamped again by the executor, the scope resolves through the owning session's product adapter, results are bounded by the Codex adapter, and run abort/disposal signals cancellation. Dynamic tool calls render through the existing keyed tool-activity path and completed Codex items remain authoritative.

No Pi `ToolDefinition`, extension host, permission implementation, or baked-tool registry crosses into Codex. Networked, mutating, credentialed, and destructive Pho Code tools remain excluded. Stable ACP v1 has no analogous client developer-instruction or dynamic-tool operation; Claude keeps bridge-owned tools and instructions. Sharing a Pho tool with ACP later requires a separately reviewed MCP server and permission contract.

## Evidence and sources

- Installed Codex `app-server generate-json-schema --experimental` exposed `developerInstructions` and `dynamicTools` on `thread/start`, `developerInstructions` on `thread/resume`, and the `item/tool/call` request with required thread, turn, call, tool, and arguments identity.
- The [official Codex App Server documentation](https://developers.openai.com/codex/app-server) marks `dynamicTools` and `item/tool/call` experimental, describes tool definitions as thread-start metadata, and requires a client response containing returned content items.
- Focused Codex adapter, ACP regression, product-tool, hosted-runtime, protocol, and conversation tests: 60 passed, 0 failed.
- Root TypeScript check passed across all 11 packages after the implementation.
- Root lint passed with 0 errors and the same 9 pre-existing React Hook warnings; the production desktop build passed.
- Focused Electron backend-composer and typed-bridge smoke checks passed 2 tests outside the managed sandbox. Their first sandboxed launch attempt failed because macOS denied Electron process launch; the unchanged external rerun passed.
- Root and Pho Agent submodule `git diff --check` passed.
- Real provider use is owner-reported rather than independently replayed in this change.

## Remaining V5 gates

This closes the bounded instruction/first-tool slice, not B0-B4 or V5 acceptance. ACP permission/resume evidence, external-command GUI `PATH` portability, packaged behavior, cross-backend scored evaluation, specialized native surfaces, and an immutable acceptance review remain pending. Pho Agent still has no subagent orchestration feature.
