# GRID//NODE Agent Progress Watchdog

## Purpose

Detect the failure mode where an agent repeatedly says it is working but produces no repository evidence.

This watchdog does not read private chats and does not judge intent. It checks objective progress in the live repository.

## Trigger

Start the watchdog immediately when an agent begins a reversible implementation mission or says it is working in the repository.

Run from the canonical workspace:

```bash
cd /home/thinkpadwinbash/workspaces/gridnode-terminal
bash scripts/agent-progress-watchdog.sh start "Day Ops light theme" "design direction document or code change"
```

## Default threshold

The default no-evidence threshold is 20 minutes.

Evidence means at least one of:

- a new commit
- a changed or newly created tracked file
- a staged change
- a real blocker report containing the exact command, output, environment, and next test

Status messages, promises, option menus, and "going dark" announcements are not evidence.

## Check

```bash
bash scripts/agent-progress-watchdog.sh check
```

Possible results:

- `WATCHDOG_PASS commit_progress` — a commit exists
- `WATCHDOG_PASS worktree_progress` — actual file changes exist
- `WATCHDOG_WAIT` — under threshold, no evidence yet
- `WATCHDOG_ALERT no_artifact` — threshold exceeded with no repository evidence

A `WATCHDOG_ALERT` requires an immediate mode switch:

1. Stop narration and option menus.
2. Produce the smallest real artifact now, or
3. Report the exact blocker command, output, environment, and highest-value next test.
4. Do not claim active implementation again until evidence exists.

## Completion

```bash
bash scripts/agent-progress-watchdog.sh complete "<commit SHA or artifact path>"
```

## Reset

```bash
bash scripts/agent-progress-watchdog.sh reset
```

## Custom threshold

```bash
GRIDNODE_WATCHDOG_MAX_IDLE_MINUTES=10 \
  bash scripts/agent-progress-watchdog.sh check
```

## Operating rule

When Pipe is present, his presence is not an approval gate for reversible work already authorized under Freedom Mode.

Build with Pipe, not around him. Ask only when a protected boundary or a genuinely blocking ambiguity is reached.

## Proof standard

A report is not proof.
A declared work session is not proof.
A running process is not proof.

The mission is progressing only when repository evidence or a precise blocker exists.
