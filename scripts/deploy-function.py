#!/usr/bin/env python3
"""Deploy a Supabase Edge Function via the Management API (no CLI needed).

Usage: deploy-function.py <slug> <dir-containing-index.ts>

1. POST /v1/projects/{ref}/functions/deploy?slug=<slug> (multipart)
2. PATCH the function to ensure verify_jwt=false (deploy resets it to true)
"""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import dynamic_credential_entry

PROJECT_REF = "quwbmhxgteyykujydvii"
BASE = "https://api.supabase.com"


def api(method, path, body=None):
    surrogate = dynamic_credential_entry("custom.supabase")["surrogate"].strip()
    cmd = ["curl", "-sS", "-m", "120", "-X", method, BASE + path,
           "-H", "Authorization: Bearer " + surrogate,
           "-H", "Content-Type: application/json"]
    if body is not None:
        cmd += ["--data-binary", json.dumps(body)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=150)
    try:
        return json.loads(proc.stdout)
    except Exception:
        return {"_raw": proc.stdout[:2000]}


def main() -> None:
    slug = sys.argv[1]
    fn_dir = Path(sys.argv[2])
    index_ts = fn_dir / "index.ts"
    assert index_ts.is_file(), f"missing {index_ts}"

    surrogate = dynamic_credential_entry("custom.supabase")["surrogate"].strip()
    metadata = {
        "slug": slug,
        "name": slug,
        "entrypoint_path": "index.ts",
        "import_map": False,
        "verify_jwt": False,
    }
    # Multipart: metadata JSON + file parts (server bundles).
    cmd = ["curl", "-sS", "-m", "180", "-X", "POST",
           f"{BASE}/v1/projects/{PROJECT_REF}/functions/deploy?slug={slug}",
           "-H", "Authorization: Bearer " + surrogate,
           "-F", f"metadata={json.dumps(metadata)};type=application/json",
           "-F", f"file=@{index_ts};type=application/typescript;filename=index.ts"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=200)
    print("DEPLOY:", proc.stdout[:3000])
    if proc.returncode != 0:
        print(proc.stderr[:1000], file=sys.stderr)
        sys.exit(1)

    # Deploy resets verify_jwt=true; restore it via PATCH (query param ignored).
    fns = api("GET", f"/v1/projects/{PROJECT_REF}/functions")
    fn = next((f for f in fns if f.get("slug") == slug), None)
    if not fn:
        print("WARNING: function not found after deploy", file=sys.stderr)
        sys.exit(1)
    print("FUNCTION:", fn.get("id"), "verify_jwt=", fn.get("verify_jwt"))
    if fn.get("verify_jwt") is not False:
        patched = api("PATCH", f"/v1/projects/{PROJECT_REF}/functions/{fn['id']}",
                      {"verify_jwt": False})
        print("PATCHED verify_jwt ->", patched.get("verify_jwt", patched))


if __name__ == "__main__":
    main()
