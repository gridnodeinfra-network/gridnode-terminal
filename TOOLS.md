# TOOLS — NULLBORN WSL environment

## SSH access
- **Canonical key**: `/home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn` (VPS-side, `nexusadmin` user)
- **Target**: `pipe_blade@127.0.0.1:2223`
- **Canonical lane pattern** (from VPS as nexusadmin):
  ```bash
  sudo -u nexusadmin ssh \
    -i /home/nexusadmin/.ssh/id_ed25519_racknerd_to_nullborn \
    -p 2223 \
    -o StrictHostKeyChecking=yes \
    pipe_blade@127.0.0.1
  ```
- **Fingerprints** (pinned, do not regenerate):
  - Client key: `SHA256:JACN1KHmo9kmsfkLFYuHdidPw4+/sQjeMLt5wMDES70`
  - NULLBORN host: `SHA256:II6NeXPnd1wuTOyrchhsp7F7Dn3UNinragXgwaLOkDM`

## Runtime
- **nvm**: v0.40.1 at `~/.nvm`
- **Node**: v22.23.2 (default via `nvm alias default 22`)
- **npm**: 10.9.8
- **npx**: 10.9.8
- **Wrangler**: 4.127.0 (via `npx --yes`, not global)
- **Source every fresh shell**: `source ~/.nvm/nvm.sh`

## Cloudflare
- **OAuth credentials**: `~/.config/.wrangler/config/default.toml`
- **Account ID**: `f008e0b7e3867a6050b412d931a9abd9`
- **Pages project**: `gridnode`

## Supabase
- **CLI**: project-local via `npm install --save-dev supabase`
- **Project ref**: `quwbmhxgteyykujydvii`
- **Auth**: managed by CLI at `~/.supabase/`

## No `/workspace` legacy assumptions
- All active scripts derive paths from `SCRIPT_DIR` or `REPO_ROOT`
- `deploy-gridnode.sh` and `handoff-update.sh` are path-independent
- No ThinkPad-era legacy paths in active use
