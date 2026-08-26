# Codex native tool presentation seam

Date: 2026-08-26
Status: protocol/presentation seam in source; production Codex rendering not connected
Owner: V5 Pho Agent Foundation
Related implementation record: [`../../version/v5/logs/2026-08-26-codex-native-activity-prototype.md`](../../version/v5/logs/2026-08-26-codex-native-activity-prototype.md)

## Direction

Codex native tool use should render in Pho Code's existing conversation work rows. Later, backend-native subagent activity should use the same conversation-first pattern rather than introducing a generic dashboard.

## Change

Pho Code tool activity now accepts an optional backend-neutral kind. The existing row maps command, file change, MCP, web search, image, review, subagent, and other kinds to its current icon vocabulary, while Pi name-based presentation remains unchanged. The Codex adapter produces bounded name, kind, input, output, and status values for its native items.

This is a presentation seam only. Production Pho Code still uses Pi directly, so no Codex row reaches the renderer yet. Backend approvals, auth, plans, compaction boundaries, native review routing, and grouped subagent activity remain later V5 slices.
