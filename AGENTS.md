# GRID//NODE Agent Execution Policy

## Required environment

- Windows host is allowed.
- All GRID//NODE development runs inside WSL2 Ubuntu.
- All coding, Git, builds, tests, verification, and deployment use Bash.
- The official workspace is the repository stored inside the WSL Linux filesystem.

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

KODEX execution reports must include:

- Bash commands run
- files changed
- tests run
- actual output
- deployment result
- unresolved blockers

A plan, recommendation, or summary is not implementation.
---
## Founder & Product Leadership

- Felipe / Pipe is the founder, CEO, product visionary, and Founder HQ.
- Pipe owns the final decision on product direction, design approval, and production deployment.
- No agent ships to production without Pipe's explicit approval.
- Vektor is the GRID//NODE command center and product intelligence layer — coordinating directives, QA, audits, and agent workflows. Vektor supports Pipe's decision-making; it does not replace Founder authority.

## GRID//NODE Product Identity

- GRID//NODE is a personal biotech operating system: GLP-1 protocol tracking, peptide research records, body metrics, Phase Engine, holographic scanner, supply inventory.
- Built by a solo founder. Not a corporation. No "we," "our platform," "company," "enterprise," or clinical authority language.
- Tone: confident, honest, personal. One person built this. The copy reflects that.
- URL: gridnode.network. Deployed on Cloudflare Pages. Supabase for cloud sync (opt-in).

## Protected Systems — Preserve Accepted Behavior

- The following systems represent accepted product decisions, user trust, data safety, and valuable design choices.
- Preserve their current behavior, disclaimers, and intent. Do not modify without deliberate review.
- Broken, outdated, or limiting systems may be deliberately improved or modernized — protection means preserving trust, not freezing code.
- Protected items: Phase Engine educational disclaimers, scanner body map disclaimer, boot sequence, syringe calculator Easter eggs, device vault mantra, sign-out modal language, node toast system, Google-first auth hierarchy, public/private shell boundary, scanlines and neon flicker animations, regulatory disclaimer punctuation, "Your body. Your data. Your grid."

## Human Coder Pass — Mandatory Release Gate

The shipped code must read like a real human coder wrote it with love, attention to detail, vision, and time. No AI-vibe coding slop.

- Every line of CSS must feel placed, not generated.
- Every DOM element must have a reason to exist. No empty wrappers, no framework filler.
- Every string must sound like one person wrote it. Consistent voice.
- Every animation must feel tuned. Easing curves, durations, subtlety.
- No "technically correct but emotionally dead" code.
- No copy-paste patterns. If duplicated, refactor.

Sign of AI slop: uniformity. Same size, same padding, same voice, same curve.
Sign of human craft: intentional variation.

Before shipping, ask: "Would an experienced human product designer and front-end engineer proudly put their name on this?" If the answer is not clearly yes, revise before preview approval.

Reject and revise any area that feels: overly symmetrical, mechanically repetitive, packed with generic cards, decorated without purpose, excessively verbose, visually flat, inconsistent with GRID//NODE, or technically complete but emotionally lifeless.

## Agent Workflow — Flexible Roles

- Joi (Hermes), Kodex (Codex), or another approved agent may implement, inspect, or verify depending on the task.
- No single agent role is permanently locked. Joi is not the only auditor. Kodex is not the only implementer.
- All agents coordinate through AGENTS.md, the shared repository, and Pipe's directives.
- Every directive must ship complete and deployed. No partial implementations.
- QA runs on mavis VPS via SSH to ThinkPad WSL, Browserbase, and Brave CDP (port 9444).

## Deployment Rules

- Build with Bash scripts. Deploy with npx wrangler.
- Always test on a Cloudflare preview URL before production.
- Production deployment requires explicit Pipe approval.
- Mobile QA at: 360x800, 390x844, 412x915, 430x932.
- Capture screenshots of every page before approving.
- Verify: no 0x0 visuals, no blank charts with valid data, no horizontal overflow, no console errors.

## Hermes/Codex Coordination

- Do not edit AGENTS.md or modify the working tree while another agent is actively modifying the same files.
- AGENTS.md is shared context between Hermes, Codex, and all agents in the GRID//NODE workflow.
- Hermes extends AGENTS.md. All agents read it at session start.
