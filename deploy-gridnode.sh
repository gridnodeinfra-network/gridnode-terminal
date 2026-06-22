#!/bin/bash
# GRID//NODE auto-deploy script
# What it does:
#   1. Copies the locked baseline to the deploy folder
#   2. Rebuilds the Cloudflare manifest
#   3. Deploys to Cloudflare Pages
#   4. Waits for the deploy to go live
#   5. Auto-updates the handoff doc
#   6. Pushes the handoff update to GitHub
#
# Usage:
#   ./deploy-gridnode.sh "brief description of what changed"

set -e

CHANGELOG="${1:-Routine deploy}"
BASELINE="/workspace/gridnode-project/01_SOURCE_TRUTH_LOCKED/gridnode-v1.3_post-phase-D_baseline.html"
DEPLOY="/workspace/gridnode-project/_deploy_v1.3"
HANDOFF="/workspace/deliverables/GRIDNODE_HANDOFF.md"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GRID//NODE DEPLOY + HANDOFF SYNC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Step 1/5: Copying baseline → deploy folder..."
cp "$BASELINE" "$DEPLOY/index.html"
ls -la "$DEPLOY/index.html"
echo ""

echo "🔨 Step 2/5: Building Cloudflare manifest..."
python3 -c "
import os, hashlib, json
deploy_dir = '$DEPLOY'
files_manifest = []
for root, dirs, files in os.walk(deploy_dir):
    if '.wrangler' in root: continue
    for filename in files:
        filepath = os.path.join(root, filename)
        relpath = os.path.relpath(filepath, deploy_dir)
        if relpath.startswith('./'): relpath = relpath[2:]
        with open(filepath, 'rb') as f: content = f.read()
        sha = hashlib.sha256(content).hexdigest()
        if filename.endswith('.html'): ct = 'text/html; charset=utf-8'
        elif filename.endswith('.js'): ct = 'application/javascript; charset=utf-8'
        elif filename.endswith('.json'): ct = 'application/json; charset=utf-8'
        elif filename.endswith('.png'): ct = 'image/png'
        else: ct = 'application/octet-stream'
        files_manifest.append({'path': relpath, 'content_type': ct, 'sha256': sha})
with open('/tmp/cf_manifest.json', 'w') as f:
    json.dump(files_manifest, f)
print(f'  → {len(files_manifest)} files staged')
"
echo ""

echo "🚀 Step 3/5: Deploying to Cloudflare Pages..."
cd "$DEPLOY"
export CLOUDFLARE_API_TOKEN=cfut_0ss0JRLE2PD4ZJMjockHeZHAui6cWK61xMEahxQhebe0e25b
export CLOUDFLARE_ACCOUNT_ID=f008e0b7e3867a6050b412d931a9abd9
npx --yes wrangler pages deploy . --project-name=gridnode --branch=main --commit-dirty=true 2>&1 | tail -8
echo ""

echo "⏳ Step 4/5: Waiting for deploy to propagate (10 seconds)..."
sleep 10

echo "✅ Step 5/5: Verifying live + auto-syncing handoff + pushing to GitHub..."
./handoff-update.sh "$CHANGELOG"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ DEPLOY COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Live: https://gridnode.network/"
echo "Handoff: $HANDOFF (updated)"
echo "GitHub: pushed"
