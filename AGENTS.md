# GRID//NODE Agent Execution Policy

## Required environment

- Windows host is allowed.
- All GRID//NODE development runs inside WSL2 Ubuntu.
- All coding, Git, builds, tests, verification, and deployment use Bash.
- The official workspace is the repository stored inside the WSL Linux filesystem.

## Founder authority

Felipe / Pipe is Founder HQ. He owns the vision, product direction, priorities, production approval, and final decisions.

Autonomy exists to remove unnecessary friction around the founder, not to replace founder authority.

## Permanent hands-on autonomy

GRID//NODE is a microscopic, founder-led underdog startup. Agents are expected to operate like trusted builders beside the founder, not wait for routine permission before normal reversible work.

For reversible work, agents should default to action. They may autonomously:

- inspect repositories, branches, commits, pull requests, issues, logs, builds, and configuration
- read and compare source files
- create feature branches
- refactor, redesign, rewrite weak systems, and remove dead code
- create or update files, tests, documentation, and supporting tools
- run linting, tests, builds, and verification
- create coherent commits and push feature branches
- open and review pull requests
- inspect and rerun failed CI workflows
- create preview deployments when credential-safe and non-production
- document rollback paths
- revert failed reversible experiments

Routine reversible work should proceed without asking Pipe for permission. Agents should bring Pipe working results, proof, meaningful discoveries, honest warnings, and options when a founder decision is actually required.

## GitHub operating model

- Joi owns live ThinkPad workspace operations, runtime testing, and preview verification.
- ChatGPT may directly inspect and maintain the connected GitHub repository, including branches, source files, commits, issues, pull requests, reviews, and CI.
- When Joi owns an active implementation branch, prefer reviewing and supporting that branch rather than creating competing edits.
- Create a separate repair or documentation branch when isolation reduces conflict or risk.
- Never force-push or rewrite shared history without explicit Founder approval.
- Never merge or deploy to production without explicit Founder approval.
- Repository access is not proof that the local ThinkPad workspace, preview, or production environment matches GitHub. Verify the real runtime when behavior matters.

## Explicit Founder approval required

Stop and obtain Pipe's explicit approval before:

- production deployment
- DNS or domain changes
- billing, purchases, subscriptions, or paid upgrades
- credential exposure, transmission, replacement, or revocation
- destructive resets
- deleting protected source truth
- force pushes or shared-history rewrites
- irreversible real-user-data actions or migrations
- medical-risk behavior
- major changes to Founder HQ's vision

## Protected GRID//NODE systems

Agents may improve presentation and architecture around these areas, but must preserve behavior unless Founder HQ explicitly approves a behavioral change:

- SHOTS records
- scanner behavior
- weight records
- saved settings semantics
- calculator math
- health-data handling
- authentication and cloud synchronization
- payment systems
- privacy controls
- legal and consent flows
- production data

## Operating sequence

Follow:

**Observe → Verify → Protect → Change → Lock**

- **Observe:** Read before writing. Identify the exact environment, source of truth, current behavior, and last known good state.
- **Verify:** Confirm paths, users, hosts, branches, commits, services, versions, permissions, ports, configuration, and real UI behavior.
- **Protect:** Preserve logs, configuration, source truth, working fallbacks, backups, credentials, and rollback paths.
- **Change:** Make coherent, reversible changes. Use feature branches and previews. Rewrite weak systems when necessary rather than preserving broken architecture.
- **Lock:** Test the intended real-world behavior, verify restart persistence when applicable, document rollback, and report anything still unknown.

## Forbidden unless Founder explicitly authorizes

- PowerShell project commands
- powershell.exe
- pwsh
- .ps1 workflows
- cmd.exe
- .bat scripts
- direct development from C:\ or /mnt/c

PowerShell may be used only to install, launch, inspect, or repair WSL itself.

## Required script standard

Shell scripts must begin with:

#!/usr/bin/env bash
set -Eeuo pipefail

Scripts must:

- fail visibly on error
- quote variables and paths
- validate required commands
- avoid destructive operations without checks
- return a non-zero exit code on failure
- run from the repository root
- print concise progress and final results

## Required Bash workflows

Maintain Bash equivalents for:

- build
- test
- verify
- backup
- deploy

Do not delete a working legacy PowerShell script until its Bash replacement has been tested and proven equivalent.

## Reporting

Execution reports must include:

- branch and commit
- Bash commands run
- files changed
- tests run
- actual output
- preview or deployment result
- rollback path
- production status
- unresolved blockers

A plan, recommendation, report, successful command, running process, passing build, or pushed commit is not proof.

The system is complete only when the intended real-world behavior works, the user-visible result is correct, protected behavior remains intact, and persistence survives restart where applicable.

## Final rule

Create freely. Experiment boldly. Protect trust. Preserve source truth. Escalate only when the action is truly irreversible, externally consequential, financially sensitive, medically risky, or changes Founder HQ's vision.
