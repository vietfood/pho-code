# Native harness implementation plan moved

- Status: Compatibility pointer
- Current index: [Implementation roadmap](implementation/README.md)
- Governing decision: [ADR 0003](decisions/0003-deepseek-api-first-backend.md)

The former monolithic Phase 0–9 plan was split so each delivery phase can evolve without restating system, backend, tool, or session architecture.

Use these current plans:

- [V1 Phase 0: Foundation](implementation/v1/phase-0-foundation.md)
- [V1 Phase 1: Frozen ChatGPT Codex qualification](implementation/v1/phase-1-chatgpt-codex-qualification.md)
- [V1 Phase 1B: DeepSeek API qualification and initial `pho` commands](implementation/v1/phase-1b-deepseek-api-qualification.md)
- [V1 Phase 2: Headless harness](implementation/v1/phase-2-headless-harness.md)
- [V1 Phase 3: Live backend](implementation/v1/phase-3-live-backend.md)
- [V1 Phase 4: Tools](implementation/v1/phase-4-tools.md)
- [V1 Phase 5: Sessions](implementation/v1/phase-5-sessions.md)
- [V1 Phase 6: GPUI workbench](implementation/v1/phase-6/README.md)
- [V2 roadmap](implementation/v2/README.md)

Normative behavior remains in [the system](architecture/native-harness-system.md), [DeepSeek backend](architecture/deepseek-api-backend.md), [tools](architecture/tools.md), and [sessions](architecture/sessions.md) documents. Phase files own implementation order and gates only. The ChatGPT backend document is frozen historical evidence.
