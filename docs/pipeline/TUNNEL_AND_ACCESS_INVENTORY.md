# GRID//NODE Tunnel & Access Inventory

**Status:** Canonical operating inventory  
**Purpose:** Prevent route confusion, duplicate keys, wrong-user SSH attempts, and accidental development from the wrong machine.

## 1. Mavis VPS

- Hostname: `mavis`
- User: `ubuntu`
- Tailscale IP: `100.109.119.3`
- Role: Joi/Hermes control plane, reverse-tunnel endpoint, orchestration shell
- Local reverse-tunnel listener: `127.0.0.1:2223`
- ThinkPad access key path: `/home/ubuntu/.ssh/id_ed25519_thinkpad`

### Preferred command from Mavis

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1
```

### Preferred workspace-entry command from Mavis

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1 \
  'cd /home/thinkpadwinbash/workspaces/gridnode-terminal && exec bash'
```

## 2. ThinkPad WSL

- Environment: WSL2 Ubuntu
- User: `thinkpadwinbash`
- Tailscale IP: `100.117.29.94`
- SSH port: `2222`
- Role: official GRID//NODE development workspace and runtime test host
- Workspace: `/home/thinkpadwinbash/workspaces/gridnode-terminal`
- Reverse-tunnel service: `gridnode-tunnel.service`

### Direct route

```bash
ssh -i ~/.ssh/id_ed25519_thinkpad \
  -p 2222 \
  thinkpadwinbash@100.117.29.94
```

### Tunnel direction

```text
ThinkPad WSL 127.0.0.1:2222
        ↓ reverse SSH tunnel
Mavis 127.0.0.1:2223
```

### Tunnel service checks on ThinkPad WSL

```bash
systemctl --user status gridnode-tunnel.service --no-pager
ss -ltnp | grep ':2222'
```

### Reversible recovery action

```bash
systemctl --user restart gridnode-tunnel.service
systemctl --user status gridnode-tunnel.service --no-pager
```

## 3. GitHub

- Repository: `gridnodeinfra-network/gridnode-terminal`
- Role: source synchronization, branches, pull requests, reviews, doctrine, continuity, and CI evidence
- GitHub does not prove the ThinkPad workspace or preview matches the repository.
- Joi owns live workspace/runtime verification.
- ChatGPT may inspect and maintain GitHub autonomously for reversible work.

## 4. Correct Identity Matrix

| Context | Correct user | Correct target |
|---|---|---|
| Mavis local shell | `ubuntu` | `mavis` |
| Mavis to ThinkPad through tunnel | `thinkpadwinbash` | `127.0.0.1:2223` |
| Direct Tailscale to ThinkPad WSL | `thinkpadwinbash` | `100.117.29.94:2222` |
| GRID//NODE workspace owner | `thinkpadwinbash` | `/home/thinkpadwinbash/workspaces/gridnode-terminal` |

## 5. Known Wrong or Stale Routes

Do not use these as the GRID//NODE development path:

- `joiops`
- `pstk`
- `r3dp0@localhost:22`
- Windows SSH as the primary workspace route
- stale IP `100.127.170.61`
- a second clone created to bypass access trouble
- a newly generated key before existing key and tunnel checks

## 6. Key Placement Facts

Record paths only. Never commit key contents.

- Mavis private key used to reach ThinkPad WSL: `/home/ubuntu/.ssh/id_ed25519_thinkpad`
- Matching public key belongs in: `/home/thinkpadwinbash/.ssh/authorized_keys`
- ThinkPad WSL key used to establish the reverse tunnel to Mavis: `~/.ssh/id_ed25519_mavis`

## 7. Verification Command

Run on Mavis:

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1 \
  'whoami; hostname; test -d /home/thinkpadwinbash/workspaces/gridnode-terminal && echo WORKSPACE_OK; git -C /home/thinkpadwinbash/workspaces/gridnode-terminal branch --show-current; git -C /home/thinkpadwinbash/workspaces/gridnode-terminal rev-parse --short HEAD; git -C /home/thinkpadwinbash/workspaces/gridnode-terminal status --short --branch'
```

Expected proof:

- user is `thinkpadwinbash`
- workspace prints `WORKSPACE_OK`
- actual branch and commit are returned
- working-tree state is visible

## 8. Change-Control Rule

Any change to a host, IP, user, port, key path, service name, workspace path, or route must update this file and the recovery runbook in the same pull request.
