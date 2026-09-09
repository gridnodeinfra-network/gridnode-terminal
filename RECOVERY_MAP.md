# RECOVERY MAP — GRID//NODE on NULLBORN

Current proven recovery paths only. No obsolete ThinkPad-era procedures.

## 1. 2223 SSH lane (canonical)
- **Path**: RackNerd VPS → NULLBORN WSL via port 2223 reverse SSH tunnel
- **Key**: `/home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn` (VPS-side)
- **Target**: `pipe_blade@127.0.0.1:2223`
- **Use when**: regular agent operations
- **Last verified**: 2026-08-27

## 2. Wrangler OAuth re-authentication
- **Path**: `npx --yes wrangler login --device --browser=false` from workspace
- **Use when**: OAuth token expired/revoked
- **Returns**: verification URL + device code for browser approval
- **Last verified**: 2026-08-27

## 3. Git rollback to recovery tags
- **Tags available**:
  - `nullborn-workspace-parity-checkpoint` → `5dcff34` (ThinkPad → NULLBORN parity baseline)
  - `nullborn-deploy-path-repair` → `6b7c235` (Gate 3 deploy script path repair)
- **Use when**: need to revert to a known-good state
- **Example**: `git reset --hard nullborn-workspace-parity-checkpoint`

## 4. WSL sshd reset (Pipe-gated)
- **Use when**: WSL sshd stuck or auth state corrupt (POST-REBOOT 2223 SSH AUTH ANOMALY pattern)
- **Actions**: `wsl -d Ubuntu-24.04 -- service ssh restart` or `wsl --shutdown`
- **Note**: requires Pipe authorization; never auto-execute

## Things NOT to do during recovery
- Do not regenerate SSH keys unless the key is actually broken
- Do not recreate `/workspace/*` legacy paths
- Do not create ThinkPad dependencies
- Do not install another Hermes/OpenClaw brain
- Do not rewrite shared Git history without Pipe authorization
