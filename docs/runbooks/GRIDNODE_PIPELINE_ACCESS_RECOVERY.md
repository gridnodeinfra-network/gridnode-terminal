# GRID//NODE Pipeline Access & Recovery Runbook

**Status:** Canonical continuity document

## Purpose

Prevent repeated confusion around the GRID//NODE development path between Founder HQ, GitHub, Joi on Mavis, the SSH reverse tunnel, and the ThinkPad WSL workspace.

## Canonical Pipeline

Founder HQ / ChatGPT
→ GitHub source and continuity layer
→ Joi on Mavis
→ SSH reverse tunnel on `127.0.0.1:2223`
→ ThinkPad WSL user `thinkpadwinbash`
→ `/home/thinkpadwinbash/workspaces/gridnode-terminal`
→ feature branch
→ tests and preview
→ Pipe approval
→ production

## Canonical Environment

### Mavis VPS

- Host: `mavis`
- User: `ubuntu`
- Tailscale IP: `100.109.119.3`

### ThinkPad WSL

- User: `thinkpadwinbash`
- Direct Tailscale IP: `100.117.29.94`
- SSH port: `2222`
- Workspace: `/home/thinkpadwinbash/workspaces/gridnode-terminal`

## Preferred Mavis → ThinkPad Route

Run on **Mavis VPS** as `ubuntu`:

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1
```

Enter the workspace:

```bash
cd /home/thinkpadwinbash/workspaces/gridnode-terminal
```

One-shot verification:

```bash
ssh -i /home/ubuntu/.ssh/id_ed25519_thinkpad \
  -p 2223 \
  thinkpadwinbash@127.0.0.1 \
  'whoami; hostname; test -d /home/thinkpadwinbash/workspaces/gridnode-terminal && echo WORKSPACE_OK; git -C /home/thinkpadwinbash/workspaces/gridnode-terminal status --short --branch'
```

Expected:

- `whoami` → `thinkpadwinbash`
- `WORKSPACE_OK`
- real GRID//NODE branch/status output

## Direct ThinkPad Route

Use only when appropriate and reachable:

```bash
ssh -i ~/.ssh/id_ed25519_thinkpad \
  -p 2222 \
  thinkpadwinbash@100.117.29.94
```

## Reverse Tunnel Service

The reverse tunnel is maintained from ThinkPad WSL to Mavis.

Run on **ThinkPad WSL Ubuntu** as `thinkpadwinbash`:

```bash
systemctl --user status gridnode-tunnel.service --no-pager
```

Restart only when needed:

```bash
systemctl --user restart gridnode-tunnel.service
systemctl --user status gridnode-tunnel.service --no-pager
```

Verify WSL SSH is listening:

```bash
ss -ltnp | grep ':2222'
```

## Known Wrong Routes

Do not use these for GRID//NODE development:

- `joiops`
- `pstk`
- `r3dp0@localhost:22`
- Windows SSH as the primary GRID//NODE route
- a second GRID//NODE clone
- newly generated SSH keys before checking the existing route

## Recovery Sequence

Follow:

**Observe → Verify → Protect → Change → Lock**

1. Confirm the current shell with `whoami`, `hostname`, and `pwd`.
2. Test `127.0.0.1:2223` from Mavis before changing anything.
3. Confirm `thinkpadwinbash` and the canonical workspace path.
4. Check `gridnode-tunnel.service` on ThinkPad WSL.
5. Check port `2222` is listening in WSL.
6. Preserve existing keys and configuration.
7. Restart only the tunnel service if evidence supports it.
8. Re-run the one-shot verification command.
9. Verify the real branch, HEAD, and working-tree state.
10. Confirm the intended preview/runtime behavior before declaring success.

## Proof Standard

A successful SSH connection is not enough.

Access is verified only when:

- the user is `thinkpadwinbash`
- the canonical workspace exists
- Git reports the expected branch and state
- the task can operate in the real repository
- runtime or preview behavior is verified when relevant

## Handoff Report

Every access or recovery handoff should include:

- current shell user and host
- route used
- workspace path
- branch
- commit
- `git status`
- tunnel service state
- unresolved blockers
- whether production was touched

## Security

Do not commit:

- private keys
- tokens
- passwords
- recovery codes
- full credential contents

This document records routes and operating facts only.
