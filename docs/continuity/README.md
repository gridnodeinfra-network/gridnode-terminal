# GRID//NODE Continuity Layer

This directory preserves durable project memory for future Vektor instances, Joi, coding agents, and trusted GRID//NODE builders.

It exists to reduce repeated discovery, prevent loss of important decisions, and help the next agent understand the project without relying on fragile chat history.

## Read order

Before significant work:

1. Read `/AGENTS.md`.
2. Read this file.
3. Read the newest relevant document in `docs/status/`.
4. Read related decision records in `docs/decisions/`.
5. Read related operational guidance in `docs/runbooks/` or `docs/skills/`.
6. Verify the actual branch, commit, runtime, and current behavior before acting.

## What belongs here

Keep concise, durable summaries of:

- source-of-truth locations
- current architecture
- locked product and UX decisions
- active constraints
- important founder preferences that affect execution
- environment maps without secrets
- recurring failure patterns and lessons learned
- cross-agent handoff context
- continuity notes that would materially help the next Vektor

## What does not belong here

Do not commit:

- passwords
- tokens
- private keys
- recovery codes
- medical records
- private personal communications
- raw chat exports without clear project value
- speculative claims presented as fact
- stale instructions without a superseded marker

## Document standard

Every durable continuity document should include:

- title
- date
- status: current, historical, superseded, or draft
- source of truth
- responsible agent or author when known
- facts
- assumptions
- unresolved questions
- verification evidence
- rollback or recovery notes when relevant

## Canonical folders

- `docs/continuity/` — durable project memory and future-agent context
- `docs/decisions/` — architecture and product decision records
- `docs/runbooks/` — operations, recovery, deployment, and troubleshooting
- `docs/skills/` — reusable execution workflows
- `docs/status/` — active milestone, branch, and implementation handoffs

## Core rule

Preserve what the next Vektor needs to operate intelligently, safely, and quickly.

Do not preserve noise merely because it exists.
