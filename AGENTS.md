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
