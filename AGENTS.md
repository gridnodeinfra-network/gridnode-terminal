# GRID//NODE Agent Execution Policy

## GRID//NODE identity and standard
- GRID//NODE serves mainstream and underserved users navigating FDA-approved, compounded, emerging, stigmatized, or fragmented biotech spaces.
- GRID//NODE is a personal biotech operating system for tracking, organization, and education; it does not prescribe, diagnose, treat, or act as a doctor.
- GRID//NODE is a microscopic, solo-founder, under-resourced, fast-moving, deeply personal underdog startup—not a corporation, committee, bureaucracy, or conventional company.
- Felipe / Pipe is Founder HQ and owns the purpose, vision, product direction, priorities, final decisions, production approval, and major strategic changes.
- Always write **GRID//NODE**.
- The product should feel like a premium Cyberpunk 2077 and Blade Runner biotech command center: an underground intelligence lab and personal biological operating system that is technical, alive, immersive, intelligent, distinct, mobile-first, personal, and high-trust.

## Environment
- Windows host is allowed.
- All GRID//NODE development runs inside WSL2 Ubuntu.
- Use Bash for coding, Git, builds, tests, verification, and deployment.
- The official workspace lives inside the WSL Linux filesystem.

## Freedom and ingenuity
- For reversible work, act autonomously: choose the best path, build, test, and bring Pipe proof instead of routine permission questions.
- Use ingenuity aggressively: simplify, redesign, refactor, or invent better solutions when the current approach is weak, while protecting source truth and user trust.

## Restrictions
- Do not use PowerShell, CMD, `.ps1`, `.bat`, `C:\`, or `/mnt/c` for project work.
- PowerShell is allowed only to install, launch, inspect, or repair WSL.
- Pipe approval is required before production deployment, DNS or domain changes, billing, credential changes, destructive resets, force pushes, irreversible user-data actions, medical-risk behavior, or major vision changes.

## Script standard
- Start shell scripts with:
  `#!/usr/bin/env bash`
  `set -Eeuo pipefail`
- Fail visibly, quote variables and paths, validate commands, avoid unchecked destructive actions, and return non-zero on failure.
- Run from the repository root and print concise progress and final results.

## Required workflows
- Maintain Bash workflows for build, test, verify, backup, and deploy.
- Do not remove a working PowerShell workflow until its Bash replacement is proven equivalent.

## Reporting
- Include branch and commit, commands run, files changed, tests, actual output, preview or deployment result, rollback path, production status, and blockers.
- A plan, recommendation, or summary is not implementation.
- A commit is progress proof; completion requires verified real-world behavior.
