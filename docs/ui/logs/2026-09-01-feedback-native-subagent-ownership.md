# Native subagent ownership and Pho child controls

Kind: feedback

Status: product/plan corrected; UI not implemented

Surface: subagent transcript activity and planned Agents surface

Owner: features/subagents (product); ui/conversation chrome (host rules only)

Owning plan: [`../../features/subagents/implementation-plan.md`](../../features/subagents/implementation-plan.md)

Related logs: [`2026-09-01-decision-subagent-surface.md`](./2026-09-01-decision-subagent-surface.md),
[`2026-08-26-codex-native-tool-presentation.md`](./2026-08-26-codex-native-tool-presentation.md),
[`../../features/subagents/logs/2026-09-01-owner-correction-backend-ownership.md`](../../features/subagents/logs/2026-09-01-owner-correction-backend-ownership.md)

## Owner feedback

Pho owns subagent creation/control only for the main Pho backend, which wraps
Pi. Codex and Claude ACP own their native subagents. Pho should render native
activity or inform the owner only when it can do so truthfully. The parent must
be able to stop a stuck Pho child and continue the same child with more context,
including exploration followed by coding.

## Corrected UI decision

1. Full Pho child cards/roster/inspector use Pho/Pi relationship identity and
   can show exact prompt, model, context, tools, authority, transcript, usage,
   Continue, message delivery, and Stop.
2. Every active Pho child row has an accessible Stop action. List/inspect views
   also show the immutable id and currently valid parent controls.
3. Continue is visually a new phase in the same child, not an invisible prompt
   append. Any access change shows its new authority/permission outcome.
4. Parent-mediated sibling relay is shown as explicit parent activity and
   ordinary input in the receiving child. No invisible peer conversation is
   rendered because none exists in the first product.
5. Codex/Claude native subagent presentation uses a backend-owned badge and a
   capability ladder:
   - disclosure only when Pho cannot observe native work;
   - transcript activity when only a bounded event exists;
   - a read-only Backend activity group only with stable child identity;
   - an exact backend-owned control only when the official adapter exposes and
     verifies it.
6. A generic native `subagent` row never receives Pho Continue/Stop controls or
   appears in the Pho roster by inference.

## Verification

Documentation feedback only. No renderer, Electron, provider, or packaged test
ran. Implementation must add reciprocal feature/UI logs and verify each external
adapter at the presentation level it claims.
