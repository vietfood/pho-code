# Pho Code personal v2 archive

Personal v2 was accepted and archived on 2026-08-14. Its coherent outcome is a daily-driver local agent with legible autonomy, bounded retrieval, provider accounts, independent chat lifecycles, interoperable text-only skills, and one fixed read-only GitHub MCP capability.

## Accepted record

- [`product-v2.md`](./product-v2.md) — accepted product boundary;
- [`implementation-plan-v2.md`](./implementation-plan-v2.md) — Milestones 0 through 4 contracts and evidence;
- [`reviews/milestone-4-code-review.md`](./reviews/milestone-4-code-review.md) — final Milestone 4 and v2 closure review;
- [`../v1/README.md`](../v1/README.md) — preceding personal-v1 archive.

Milestone 5 is not part of v2. The former advanced-feature umbrella is split into independently promotable phases in the live [`roadmap-vnext.md`](../../roadmap-vnext.md).

## Durable versions at closure

- Pi SDK/runtime: `0.84.1`;
- Electron: `43.0.0` with embedded Node `24`;
- permission system: `24.0.0`;
- FFF Node integration: `0.10.1`;
- Cursor SDK provider: `pi-cursor-sdk` `0.2.0`;
- GitHub MCP server: `github/github-mcp-server` `1.9.0`;
- MCP TypeScript client: `1.30.0`.

## Verification scope

The final closure ran workspace typecheck, focused regression tests, and the complete Bun suite: 431 tests passed. Earlier milestone records contain the accepted desktop, packaged macOS, FFF, provider-login, session-continuity, archive/restore, and Trash evidence.

The closure did not claim signed/notarized distribution, Linux desktop verification, hostile local-process containment, a public threat model, telemetry/update policy, or a live GitHub-account rerun during the archival turn. Those are future public-release gates, not hidden v2 claims.
