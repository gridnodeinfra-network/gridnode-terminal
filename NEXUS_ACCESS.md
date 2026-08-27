# NEXUS AGENT ACCESS — GRID//NODE on NULLBORN

## Canonical machine + workspace
- **NULLBORN** is canonical. No ThinkPad dependency, no Hermes/OpenClaw brain.
- **Workspace**: `/home/pipe_blade/workspaces/gridnode-terminal/`
- **Git HEAD baseline**: `82b9440` (clean working tree)
- **Remote**: `https://github.com/gridnodeinfra-network/gridnode-terminal.git`

## Reaching NULLBORN WSL (canonical 2223 lane)
- **Path**: RackNerd VPS `racknerd-4992bc2` → NULLBORN WSL via port 2223 reverse SSH tunnel.
- **VPS identity**: `nexusadmin` user.
- **Canonical SSH key (VPS-side)**: `/home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn`
- **Target user**: `pipe_blade@127.0.0.1:2223`
- **Host fingerprint (NULLBORN WSL)**: pinned in MEMORY.md (canonical, do not regenerate).
- **OpenClaw Windows Companion**: SEPARATE recovery lane. Do NOT replace the 2223 SSH lane with it. They are independent.

### Proven SSH lane pattern (from VPS)
```bash
sudo -u nexusadmin ssh \
  -i /home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn \
  -p 2223 \
  -o StrictHostKeyChecking=yes \
  pipe_blade@127.0.0.1
```

## GitHub + collaboration model
- **`main` = integration/production line.** Do not push directly to `main` unless explicitly authorized.
- **For parallel agent work**: use `git worktree add <path> -b agent/<task>` so agents do not edit the same checkout simultaneously.
- **Agents may normally**: inspect, edit, create files, run tests, diagnose/recover ordinary failures, commit, push their branch, verify results.
- **Do not require Pipe approval for ordinary shell/tooling decisions.**

## Runtime
- **Node**: v22.23.2 via nvm v0.40.1 (user `pipe_blade` only — NOT system-wide, NOT Hermes).
- **Wrangler**: 4.127.0 via `npx --yes` (NOT global install).
- **Cloudflare OAuth**: stored at `~/.config/.wrangler/config/default.toml` (account ID `f008e0b7e3867a6050b412d931a9abd9`).
- **Verify identity**: `npx --yes wrangler whoami` from the workspace.

## Cloudflare / Wrangler workflow
- **Project**: `gridnode` (Pages) — domains `gridnode.pages.dev`, `gridnode.network`, `www.gridnode.network`.
- **OAuth belongs to `pipe_blade`**. Do not create a second Cloudflare credential system unless needed for CI later.

## Supabase project + config
- **Source files**: `/home/pipe_blade/workspaces/gridnode-terminal/supabase/`
  - `config.toml` — project config
  - `schema.sql` — schema baseline
  - `webauthn-schema.sql` — webauthn extension
  - `functions/` — 4 edge functions + `_shared/webauthn.ts`
  - `migrations/` — schema migrations (e.g. `20260802170000_webauthn_security.sql`)
- **Credentials**: loaded conditionally from `~/.gridnode-secrets/load-credentials.sh` if the file exists. Do not create or rotate without Pipe approval.

## Canonical deploy command
```bash
bash /home/pipe_blade/workspaces/gridnode-terminal/deploy-gridnode.sh "<change description>"
```
- **What it does**: copies baseline (or candidate) → `_deploy_v1.3/`, builds Cloudflare manifest, deploys via `wrangler pages deploy`, waits 10s, then runs `handoff-update.sh` (verify local vs live SHA, update `GRIDNODE_HANDOFF.md`, commit + push if drift detected).
- **Both scripts are path-independent**: derive `SCRIPT_DIR` + `REPO_ROOT` from script location. No `/workspace/*` hardcoded paths.
- **Wrangler OAuth already belongs to `pipe_blade`**. No hard `CLOUDFLARE_API_TOKEN` requirement.

## Recovery checkpoints (git tags)
- `nullborn-workspace-parity-checkpoint` → `5dcff34` (ThinkPad → NULLBORN parity baseline)
- `nullborn-deploy-path-repair` → `6b7c235` (Gate 3 deploy script path repair)

## Agent authority vs Pipe gates

### Agents may (no Pipe approval needed)
- inspect / read / write / edit files in the workspace
- create branches + worktrees
- run tests
- diagnose/recover ordinary failures
- commit + push to non-`main` branches
- run `handoff-update.sh` (verify sync only; commits/pushes only if drift detected)
- add/modify `.gitignore` for generated artifacts
- update `NEXUS_ACCESS.md` and `AGENTS.md` (operational docs, not production code)

### Pipe gates (require explicit approval)
- Production deploy when not explicitly delegated
- Destructive deletion of valuable data
- Credential rotation / revocation (Cloudflare, Supabase, SSH)
- Major architecture changes
- Production Cloudflare / Supabase policy changes
- Rewriting shared Git history (force-push, rebase of published branches)
- Modifying the 2223 tunnel, its keys, or restarting WSL/sshd
- Merging frozen branches (`.worktrees/*`, Gate 3 staging)
- Reviving Gate 3 without explicit mission directive

## Security rules
- **No secrets** in `NEXUS_ACCESS.md`, `AGENTS.md`, Git commits, logs, or MEMORY.md.
- **Document credential LOCATION + CAPABILITY**, never VALUES.
- **Do not duplicate private keys** across agents unnecessarily.
- **Do not recreate** `/workspace/*` legacy paths.
- **Do not create** ThinkPad dependencies.
- **Do not install** another Hermes/OpenClaw brain.
- **Remove temporary audit/helper artifacts** at end of each mission.
