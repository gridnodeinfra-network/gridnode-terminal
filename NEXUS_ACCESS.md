# NEXUS AGENT ACCESS — GRID//NODE on NULLBORN

## Canonical machine + workspace
- **NULLBORN** is canonical. No ThinkPad dependency, no Hermes/OpenClaw brain.
- **Workspace**: `/home/pipe_blade/workspaces/gridnode-terminal/`
- **Git HEAD baseline**: `82b9440` (clean working tree)
- **Remote**: `https://github.com/gridnodeinfra-network/gridnode-terminal.git`

## Canonical 2223 recovery lane (RackNerd → NULLBORN WSL)
- **Path**: RackNerd VPS `racknerd-4992bc2` → NULLBORN WSL via port 2223 reverse SSH tunnel.
- **VPS identity**: `nexusadmin` user (canonical SSH key holder).
- **Canonical SSH key (VPS-side)**: `/home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn`
- **Target user**: `pipe_blade@127.0.0.1:2223`
- **Fingerprints**: pinned in TOOLS.md (canonical, do not regenerate).
- **OpenClaw Windows Companion**: SEPARATE recovery lane. Do NOT replace the 2223 lane with it.

### Canonical lane pattern (from VPS as nexusadmin)
```bash
sudo -u nexusadmin ssh \
  -i /home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn \
  -p 2223 \
  -o StrictHostKeyChecking=yes \
  pipe_blade@127.0.0.1
```

## Fresh-shell startup sequence
```bash
ssh -i /home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn \
  -p 2223 pipe_blade@127.0.0.1

cd /home/pipe_blade/workspaces/gridnode-terminal
source ~/.nvm/nvm.sh
git status -sb
npx --yes wrangler whoami
```
**Verify expected fingerprints before trusting a changed SSH host identity.**

## Git collaboration model
- **`main` = integration/production line.** Do not push directly to `main` unless explicitly authorized.
- **For parallel writers**: one named branch + Git worktree per agent.
- **Agents may autonomously**: inspect, edit, test, diagnose ordinary failures, commit and push their own branches.
- **Never overwrite another active worktree.**

## Runtime (node + nvm + Wrangler)
- **nvm**: v0.40.1 at `~/.nvm` (user `pipe_blade` only — NOT system-wide, NOT Hermes).
- **Node**: v22.23.2 (default alias `default -> 22` via `nvm alias default 22`).
- **npm**: 10.9.8.
- **npx**: 10.9.8.
- **Wrangler**: 4.127.0 via `npx --yes` (NOT global install).
- **Source**: `source ~/.nvm/nvm.sh` in every fresh shell.

## Cloudflare auth + deploy workflow
- **Pages project**: `gridnode` — domains `gridnode.pages.dev`, `gridnode.network`, `www.gridnode.network`.
- **OAuth belongs to `pipe_blade`** at `~/.config/.wrangler/config/default.toml` (account ID `f008e0b7e3867a6050b412d931a9abd9`).
- **Do not duplicate Cloudflare credentials or create an API token merely for agent onboarding.**
- **Verify**: `npx --yes wrangler whoami`

### Canonical production deploy (Pipe-gated unless explicitly delegated)
```bash
bash /home/pipe_blade/workspaces/gridnode-terminal/deploy-gridnode.sh "<change description>"
```
What it does: copies baseline (or candidate) → `_deploy_v1.3/`, builds Cloudflare manifest, deploys via `wrangler pages deploy`, waits 10s, runs `handoff-update.sh` (verify local vs live SHA, update handoff, commit + push if drift detected).

Both `deploy-gridnode.sh` and `handoff-update.sh` are path-independent (`SCRIPT_DIR` + `REPO_ROOT` derived from script location). No `/workspace/*` legacy paths.

## Supabase source/config + CLI workflow
- **Source files**: `/home/pipe_blade/workspaces/gridnode-terminal/supabase/`
  - `config.toml` — project config
  - `schema.sql` — schema baseline
  - `webauthn-schema.sql` — webauthn extension
  - `functions/` — 4 edge functions + `_shared/webauthn.ts`
  - `migrations/` — schema migrations (e.g. `20260802170000_webauthn_security.sql`)
- **CLI**: project-local (`npm install --save-dev supabase`), invoked via `npx supabase ...`
- **Project ref**: `quwbmhxgteyykujydvii`
- **Authenticate/link** (only if not already established):
  ```bash
  npx supabase login
  npx supabase link --project-ref quwbmhxgteyykujydvii
  ```
- **Verify remote project/function visibility** without deploying or changing production.
- **Do not start the local Docker Supabase stack** as part of routine work.
- **Credentials**: managed by Supabase CLI at `~/.supabase/`. Do not print/store in repo docs.

## Pipe gates (require explicit approval)
- Production deployment unless explicitly delegated
- Destructive deletion of valuable data
- Credential rotation/revocation (Cloudflare, Supabase, SSH)
- Production Cloudflare/Supabase policy/schema mutations
- Major canonical architecture changes
- Rewriting shared Git history

Ordinary reversible technical execution belongs to the agents.

## Security rules
- No secret VALUES in `NEXUS_ACCESS.md`, `AGENTS.md`, `TOOLS.md`, `RECOVERY_MAP.md`, MEMORY or Git.
- Document credential LOCATIONS + CAPABILITIES, never VALUES.
- Preserve existing proven SSH keys; do not regenerate them.
- Do not recreate `/workspace/*`.
- Do not create ThinkPad dependencies.
- Do not install another Hermes/OpenClaw brain.
- Remove temporary artifacts at end of each mission.
