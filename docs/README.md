# Internal documentation

This tree is the working memory for agents and maintainers. The root `README.md` is the user-facing product page; internal implementation work starts from `AGENTS.md` and is routed here.

Use [`.agents/skills/maintain-pho-docs`](../.agents/skills/maintain-pho-docs/SKILL.md) for the update/archive workflow and [`.agents/skills/test-pho-code`](../.agents/skills/test-pho-code/SKILL.md) for verification.

Pho Code docs are grouped by ownership and kind of work, not by date.

| Folder | What belongs here |
| --- | --- |
| [`architecture/`](./architecture/README.md) | Accepted layer boundaries and shell decisions |
| [`archive/`](./archive/README.md) | Closed numbered versions, features, and urgent tracks |
| [`assets/capture/`](./assets/capture/README.md) | Demo GIFs and the recording sheet only |
| [`features/`](./features/README.md) | Standalone add-ons (not a numbered product version) |
| [`urgent/`](./urgent/README.md) | Owner-priority defects, safety, and startup work to do before more capability |
| [`ui/`](./ui/README.md) | Conversation chrome: design, implementation, ideas, changes, feedback, and defect logs |
| [`version/`](./version/README.md) | Promoted numbered product versions (V4 pending; V5 Pho Agent Foundation blocked) and later-release roadmap |

Living entry points that stay at this root:

- [`current-state.md`](./current-state.md) — what exists today
- [`development.md`](./development.md) — commands, isolation, verification
- [`references-and-attribution.md`](./references-and-attribution.md) — what was read vs adapted
- [`third-party-notices.md`](./third-party-notices.md) — shipped licenses

Do not mix these:

- closed v3 product/plan/evidence → `archive/v3/`, not `version/` or `features/`
- closed accepted add-ons (sandbox, plan-agent) → `archive/features/`, not `features/`
- terminal, compaction, later add-ons → `features/`, not `version/`
- conversation chrome and UI bugs → `ui/`, not `features/`
- open startup, crash isolation, safety, and “do this before more features” work → `urgent/`; accepted/closed urgent evidence → `archive/urgent/`
- demo captures → `assets/capture/`, not `archive/`

## Workstream contract

An active numbered version, promoted add-on, or urgent track owns:

1. a short local `README.md`;
2. a product contract;
3. an implementation plan with acceptance gates;
4. a `logs/` directory for dated execution records.

One-file notes under `urgent/` are pointers, not that contract.

Plans are read-mostly contracts. Do not append chat-by-chat evidence or corrections to a shared plan while parallel work is active. Create one dated log file per implementation slice, issue, or feedback thread instead.

Every work log records:

- status and owning plan or milestone;
- intent and affected contracts/files;
- related workstream logs;
- changes and decisions;
- verification actually run, using the repository verification classes;
- mistakes, corrections, and owner feedback;
- UI impact, blockers, and handoff.

When work touches a shared protocol, Electron adapter, accepted architecture boundary, or the right-sidebar host, scan active logs under `version/*/logs/`, `features/*/logs/`, `urgent/*/logs/`, and `ui/logs/`. Cross-link the relevant records from both workstreams. There is no central append-only coordination file.

At acceptance, one integrator updates shared summaries and writes an immutable review. Old logs remain evidence; they are not rewritten to make an earlier mistake disappear.
