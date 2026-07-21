# GRID//NODE Pipeline Quick Reference

## From Mavis into the real workspace

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1 \
  'cd /home/thinkpadwinbash/workspaces/gridnode-terminal && exec bash'
```

## One-command proof

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1 \
  'whoami; hostname; test -d /home/thinkpadwinbash/workspaces/gridnode-terminal && echo WORKSPACE_OK; git -C /home/thinkpadwinbash/workspaces/gridnode-terminal status --short --branch'
```

## Correct facts

```text
Mavis user: ubuntu
ThinkPad WSL user: thinkpadwinbash
Mavis tunnel endpoint: 127.0.0.1:2223
ThinkPad WSL SSH: 100.117.29.94:2222
Workspace: /home/thinkpadwinbash/workspaces/gridnode-terminal
Tunnel service: gridnode-tunnel.service
```

## Recovery on ThinkPad WSL

```bash
systemctl --user status gridnode-tunnel.service --no-pager
ss -ltnp | grep ':2222'
systemctl --user restart gridnode-tunnel.service
systemctl --user status gridnode-tunnel.service --no-pager
```

## Never guess these

```text
Do not use joiops.
Do not use pstk.
Do not use r3dp0@localhost:22.
Do not create a second clone.
Do not generate a new key before checking the existing route.
Do not claim success without branch, commit, status, and runtime proof.
```

## Full runbook

See `docs/runbooks/GRIDNODE_PIPELINE_ACCESS_RECOVERY.md`.
