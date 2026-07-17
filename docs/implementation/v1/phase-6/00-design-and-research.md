# Phase 6.0: Decision and research

- Status: **PASS — 2026-07-17**; maintainer approved the design set and package order
- Depends on: [Phase 5](../phase-5-sessions.md)
- Governing decision: [ADR 0004](../../../decisions/0004-native-workbench-phase-6.md)
- Next: [Phase 6.1 native foundation](01-native-foundation.md)

## Outcome

Phase 6 has one accepted product boundary, one whole-workbench architecture, component-specific contracts for native lifecycle, workspace inspection, and user terminals, and research decisions for GPUI components, Markdown/LaTeX, and PTY/emulator integration. Implementation may use these documents without guessing whether tabs imply concurrent agents, whether the viewer is writable, or whether the terminal is an agent tool.

## Required artifacts

- [ADR 0004](../../../decisions/0004-native-workbench-phase-6.md)
- [GPUI workbench](../../../architecture/gpui-workbench.md)
- [Native workbench lifecycle](../../../architecture/native-workbench-lifecycle.md)
- [Workbench workspaces and inspection](../../../architecture/workbench-workspaces.md)
- [User terminal](../../../architecture/user-terminal.md)
- [`gpui-component` source study](../../../research/gpui-component-source-study.md)
- [Markdown and LaTeX study](../../../research/markdown-latex-rendering.md)
- [PTY and terminal-emulator study](../../../research/terminal-pty-source-study.md)

## Settled decisions

- V1 retains one DeepSeek backend, one selected session, and one active root turn. Chat tabs are presentation-only.
- A stable `WorkspaceRegistrationId` is separate from the existing durable `WorkspaceId` authority.
- The file viewer and uncommitted-diff viewer are read-only.
- The user PTY is direct user authority and never model context, approval, or the agent shell.
- Markdown and TeX source remain canonical; rich output is bounded and disposable.
- `gpui-component`, KaTeX, and PTY/emulator crates remain qualification candidates until their respective spikes pass.
- Native preferences are non-secret, bounded, versioned, atomic, and separate from journals.

## Review gate

Before production code begins:

1. authority links and terminology pass the local Markdown-link check;
2. no architecture file contradicts ADR 0003/0004, tools, sessions, or the native harness;
3. all selected queues, caches, tabs, files, trees, Git output, render output, PTY input/output, processes, and deadlines have an owning bound;
4. every unqualified external dependency is described as a candidate rather than supported behavior;
5. the maintainer approves the complete design set and the package order below.

Any requested change to concurrent agents, writable editing, another real backend, automatic terminal replay, or session deletion returns to an ADR/architecture update before implementation.
