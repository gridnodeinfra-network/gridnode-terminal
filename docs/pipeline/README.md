# GRID//NODE Pipeline Map

**Status:** Canonical continuity index

This folder records the verified development pipeline, tunnel topology, access routes, ownership boundaries, recovery sequence, and proof requirements for GRID//NODE.

## Canonical Flow

```text
Founder HQ / ChatGPT
        ↓
GitHub source + continuity layer
        ↓
Joi on Mavis (`ubuntu@mavis`)
        ↓
SSH reverse tunnel (`127.0.0.1:2223` on Mavis)
        ↓
ThinkPad WSL (`thinkpadwinbash`, SSH port `2222`)
        ↓
/home/thinkpadwinbash/workspaces/gridnode-terminal
        ↓
feature branch → tests → preview → Pipe approval → production
```

## Read First

1. `docs/runbooks/GRIDNODE_PIPELINE_ACCESS_RECOVERY.md`
2. `docs/pipeline/TUNNEL_AND_ACCESS_INVENTORY.md`
3. `docs/pipeline/QUICK_REFERENCE.md`

## Source of Truth Rules

- The official GRID//NODE workspace is inside ThinkPad WSL.
- The canonical workspace path is `/home/thinkpadwinbash/workspaces/gridnode-terminal`.
- The preferred Mavis route is `thinkpadwinbash@127.0.0.1:2223` using `/home/ubuntu/.ssh/id_ed25519_thinkpad`.
- Direct Tailscale access uses `thinkpadwinbash@100.117.29.94:2222` when available.
- Windows SSH is not the primary GRID//NODE development route.
- Do not create a second clone or new key before verifying the existing route.
- Never commit private keys, tokens, passwords, recovery codes, or credential contents.

## Maintenance Rule

Whenever any host, user, port, path, service, branch convention, or tunnel behavior changes, update these documents in the same branch or pull request as the infrastructure change.

A chat message is not the source of truth. The repository continuity layer is.
