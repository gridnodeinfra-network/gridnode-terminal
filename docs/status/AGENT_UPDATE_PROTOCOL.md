# GRID//NODE Agent Update Protocol

## Goal

Keep Vektor / ChatGPT hands-on without requiring Pipe to manually relay every branch, commit, preview, blocker, or infrastructure change.

## Required behavior for Joi and future runtime agents

After meaningful work, update `docs/status/LIVE_PROJECT_STATUS.md` and push the change with the implementation branch or a dedicated status commit.

A meaningful update includes:

- new branch or branch switch
- new commit or rollback
- preview created, changed, or broken
- test or build result
- tunnel failure or recovery
- source-of-truth change
- blocker discovered or cleared
- handoff to another agent
- production approval requested

## Minimum update payload

```text
Updated:
Operator:
Branch:
Commit:
Working tree:
Files changed:
Tests:
Preview URL:
Runtime result:
Tunnel status:
Blockers:
Production touched:
Next verification:
```

## GitHub synchronization rule

- Push reversible work regularly enough that Vektor can inspect it.
- Do not leave important implementation truth only in Telegram, terminal scrollback, or chat.
- Do not claim a pushed commit matches the ThinkPad runtime until verified.
- Do not commit secrets, private keys, tokens, passwords, recovery codes, medical records, or private messages.

## Vektor operating rule

Vektor should inspect GitHub directly before asking Pipe for project details. Vektor may review commits, compare branches, inspect pull requests, create repair/documentation branches, update continuity files, and report meaningful changes.

For live runtime facts not visible in GitHub, Vektor should use the latest status file and Joi's verified runtime report rather than asking Pipe to reconstruct the system manually.

## Escalation

Only interrupt Pipe for a real founder decision or protected boundary: production, DNS/domain, money, credentials, destructive actions, irreversible user data, medical risk, or major vision changes.
