# Restore provider login disclosure

Kind: bug
Status: implemented
Surface: Settings / Accounts
Owner: UI / conversation chrome
Owning plan: [`../implementation/conversation-ui.md`](../implementation/conversation-ui.md)
Related log: [`2026-08-20-bug-appearance-reverts-on-new-session.md`](./2026-08-20-bug-appearance-reverts-on-new-session.md)

## Intended change

Keep the Accounts list concise while preserving the required authentication-type disclosure for subscription-classified providers.

## Expected / actual (before)

Expected: a provider with `disclosureKey` exposes a compact “About this login” disclosure before sign-in.

Actual: the Accounts row refactor removed that disclosure entirely. The provider-auth flow still rendered the copy after sign-in started, which was too late for the owner to review the authentication classification before acting. The accepted credential and OAuth desktop journeys also failed while looking for the missing control.

## Changes and decisions

- Restored the previous native `<details>` disclosure under the provider status line.
- Kept the copy collapsed by default, so the concise Accounts layout is unchanged until the owner asks for the detail.
- Reused the typed `providerDisclosureCopy` mapping and existing provider-specific test id; no new protocol or settings surface was added.

## Verification

Pending the focused credential/OAuth desktop rerun and the V5 Milestone 0 exit lane.
