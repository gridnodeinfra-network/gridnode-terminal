#!/bin/bash
# GRID//NODE handoff auto-updater
# Run this after every deploy: ./handoff-update.sh
# What it does:
#   1. Reads the live SHA from gridnode.network
#   2. Compares to local locked baseline
#   3. Updates GRIDNODE_HANDOFF.md with the new SHA
#   4. Adds a changelog entry
#   5. Commits to git and pushes to GitHub
#
# Usage: ./handoff-update.sh "Brief description of what changed"

set -e
LIVE_URL="https://gridnode.network/"
HANDOFF="/workspace/deliverables/GRIDNODE_HANDOFF.md"
LOCKED="/workspace/gridnode-project/01_SOURCE_TRUTH_LOCKED/gridnode-v1.3_post-phase-D_baseline.html"
CHANGELOG="${1:-No description provided}"

echo "🔄 GRID//NODE handoff sync"
echo "=================================="
echo ""

# Get the live SHA
LIVE_SHA=$(curl -s "$LIVE_URL" | sha256sum | cut -c1-16)
LOCAL_SHA=$(sha256sum "$LOCKED" | cut -c1-16)

echo "Live:   $LIVE_SHA"
echo "Local:  $LOCAL_SHA"
echo ""

if [ "$LIVE_SHA" = "$LOCAL_SHA" ]; then
  echo "✅ Live and local are in sync. No update needed."
  exit 0
fi

echo "⚠️  Live differs from local. Updating handoff..."

# Get sizes
LIVE_SIZE=$(curl -sI "$LIVE_URL" | grep -i "content-length" | awk '{print $2}' | tr -d '\r')
LOCAL_SIZE=$(wc -c < "$LOCKED")

# Get the current date
DATE=$(date -u +%Y-%m-%d)
TIME=$(date -u +%H:%M)

# Append a session log entry to the handoff
cat >> "$HANDOFF.log" << EOF

---
## ✅ SESSION LOG — $DATE $TIME UTC

- **Live SHA:** \`$LIVE_SHA\`
- **Local SHA:** \`$LOCAL_SHA\`
- **Live size:** $LIVE_SIZE bytes
- **Local size:** $LOCAL_SIZE bytes
- **Change:** $CHANGELOG
- **Detected by:** handoff-update.sh
EOF

# Update the handoff with current SHAs
python3 << PYEOF
import re
from pathlib import Path
from datetime import datetime

handoff = Path("$HANDOFF")
content = handoff.read_text()

# Update or insert the current state
now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
state_block = f'''
### ✅ Latest verified state (auto-updated $now)

- ✅ **Live SHA:** `{'$LIVE_SHA'}...`
- ✅ **Local SHA:** `{'$LOCAL_SHA'}...`
- ✅ **Live size:** $LIVE_SIZE bytes
- ✅ **Local size:** $LOCAL_SIZE bytes
- ✅ **In sync:** {('$LIVE_SHA' == '$LOCAL_SHA')}
- ✅ **Last change:** $CHANGELOG
'''

# Insert after the "SESSION 2 UPDATE" header
marker = "## ✅ SESSION 2 UPDATE"
if marker in content:
    parts = content.split(marker, 1)
    # Check if "Latest verified state" already exists
    if "Latest verified state" in parts[1]:
        # Replace existing
        parts[1] = re.sub(
            r"### ✅ Latest verified state.*?(?=\n---|\\Z)",
            state_block + "\\n",
            parts[1],
            count=1,
            flags=re.DOTALL
        )
    else:
        # Insert after the SESSION 2 UPDATE heading
        parts[1] = "\\n" + state_block + parts[1]
    content = marker.join(parts)

handoff.write_text(content)
print(f"✅ Updated {handoff}")
PYEOF

# Git commit + push
git add "$HANDOFF" 2>/dev/null || true
git add /workspace/gridnode-project/01_SOURCE_TRUTH_LOCKED/ 2>/dev/null || true
git commit -m "auto: handoff sync - $CHANGELOG

Live: $LIVE_SHA
Local: $LOCAL_SHA
Size: $LIVE_SIZE bytes" 2>&1 | tail -3

git push origin main 2>&1 | tail -3

echo ""
echo "✅ Handoff updated and pushed to GitHub"
echo "📋 Session log appended to $HANDOFF.log"
