#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${GRIDNODE_WATCHDOG_STATE_DIR:-.gridnode/watchdog}"
STATE_FILE="$STATE_DIR/session.env"
MAX_IDLE_MINUTES="${GRIDNODE_WATCHDOG_MAX_IDLE_MINUTES:-20}"

mkdir -p "$STATE_DIR"

usage() {
  cat <<'EOF'
Usage:
  agent-progress-watchdog.sh start <mission> [expected_artifact]
  agent-progress-watchdog.sh check
  agent-progress-watchdog.sh complete [proof]
  agent-progress-watchdog.sh reset

Purpose:
  Detect claimed work that produces no repository evidence.
EOF
}

now_epoch() { date +%s; }
head_sha() { git rev-parse HEAD; }
worktree_fingerprint() {
  {
    git status --short
    git diff --stat
    git diff --cached --stat
  } | sha256sum | awk '{print $1}'
}

write_state() {
  local mission="$1"
  local artifact="$2"
  cat > "$STATE_FILE" <<EOF
MISSION=$(printf '%q' "$mission")
EXPECTED_ARTIFACT=$(printf '%q' "$artifact")
START_EPOCH=$(now_epoch)
START_HEAD=$(head_sha)
START_FINGERPRINT=$(worktree_fingerprint)
LAST_PROOF_EPOCH=$(now_epoch)
EOF
}

load_state() {
  [[ -f "$STATE_FILE" ]] || { echo "WATCHDOG_NOT_STARTED"; exit 2; }
  # shellcheck disable=SC1090
  source "$STATE_FILE"
}

case "${1:-}" in
  start)
    [[ $# -ge 2 ]] || { usage; exit 2; }
    write_state "$2" "${3:-unspecified}"
    echo "WATCHDOG_STARTED mission=$2 expected_artifact=${3:-unspecified} head=$(head_sha)"
    ;;
  check)
    load_state
    current_head="$(head_sha)"
    current_fingerprint="$(worktree_fingerprint)"
    elapsed_minutes=$(( ($(now_epoch) - START_EPOCH) / 60 ))

    if [[ "$current_head" != "$START_HEAD" ]]; then
      echo "WATCHDOG_PASS commit_progress start=$START_HEAD current=$current_head elapsed_min=$elapsed_minutes"
      exit 0
    fi

    if [[ "$current_fingerprint" != "$START_FINGERPRINT" ]]; then
      echo "WATCHDOG_PASS worktree_progress elapsed_min=$elapsed_minutes"
      git status --short
      exit 0
    fi

    if (( elapsed_minutes >= MAX_IDLE_MINUTES )); then
      echo "WATCHDOG_ALERT no_artifact mission=$MISSION expected=$EXPECTED_ARTIFACT elapsed_min=$elapsed_minutes head=$current_head"
      echo "Required response: produce a real artifact now or report exact blocker command/output/environment/next test."
      exit 1
    fi

    echo "WATCHDOG_WAIT no_artifact_yet elapsed_min=$elapsed_minutes threshold_min=$MAX_IDLE_MINUTES"
    ;;
  complete)
    load_state
    echo "WATCHDOG_COMPLETE mission=$MISSION proof=${2:-$(head_sha)}"
    rm -f "$STATE_FILE"
    ;;
  reset)
    rm -f "$STATE_FILE"
    echo "WATCHDOG_RESET"
    ;;
  *)
    usage
    exit 2
    ;;
esac
