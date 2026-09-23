#!/usr/bin/env python3
"""Deploy a prebuilt directory to Cloudflare Pages via the REST API.

Uses the stored ``custom.cloudflare`` connector credential through the
surrogate exchange -- the raw API token is never handled, printed, or
stored. Mirrors wrangler's direct-upload flow:

  1. GET  /accounts/{id}/pages/projects/{project}/upload-token  -> JWT
  2. POST /pages/assets/check-missing   {"hashes":[...]}         -> missing
  3. POST /pages/assets/upload          per missing file (base64, batched)
  4. POST /pages/assets/upsert-hashes   {"hashes":[...]}
  5. POST /accounts/{id}/pages/projects/{project}/deployments
       multipart: manifest (JSON path->sha256), branch, commit fields

Usage:
    cf-pages-deploy.py <staging_dir> [--project gridnode] [--branch preview]
                       [--commit-hash HASH] [--commit-message MSG]

Safety: refuses --branch main unless --confirm-production is passed.
Preview deployments are the norm (Pipe's standing rule).
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

HOST = "api.cloudflare.com"
BASE = f"https://{HOST}/client/v4"
ACCOUNT_ID = "f008e0b7e3867a6050b412d931a9abd9"

# Pages serves these without an explicit content type; be explicit anyway.
EXTRA_TYPES = {
    ".webmanifest": "application/manifest+json",
    ".map": "application/json",
}


def api(method, path, body=None, headers=None, raw_body=None, timeout=120):
    url = BASE + path
    data = None
    if raw_body is not None:
        data = raw_body
    elif body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=[HOST])
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return read_json_response(resp)


def jwt_api(method, path, jwt, body, timeout=120):
    url = BASE + path
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + jwt)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return read_json_response(resp)


def check_ok(resp, what):
    if not resp.get("success"):
        raise RuntimeError(f"{what} failed: {json.dumps(resp.get('errors'))[:500]}")
    return resp["result"]


def content_type(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in EXTRA_TYPES:
        return EXTRA_TYPES[ext]
    guess, _ = mimetypes.guess_type(path)
    return guess or "application/octet-stream"


def collect_files(root):
    entries = []  # (rel_url_path, abs_path, sha256)
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in sorted(filenames):
            abs_path = os.path.join(dirpath, name)
            rel = os.path.relpath(abs_path, root).replace(os.sep, "/")
            with open(abs_path, "rb") as fh:
                digest = hashlib.sha256(fh.read()).hexdigest()
            entries.append(("/" + rel, abs_path, digest))
    return entries


def multipart(fields):
    boundary = "----gridnode-deploy-boundary"
    parts = []
    for name, value in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n')
    parts.append(f"--{boundary}--\r\n")
    body = "".join(parts).encode()
    return body, f"multipart/form-data; boundary={boundary}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("staging_dir")
    ap.add_argument("--project", default="gridnode")
    ap.add_argument("--branch", default="preview")
    ap.add_argument("--commit-hash", default="")
    ap.add_argument("--commit-message", default="")
    ap.add_argument("--confirm-production", action="store_true")
    args = ap.parse_args()

    if args.branch == "main" and not args.confirm_production:
        print("REFUSED: --branch main needs --confirm-production", file=sys.stderr)
        sys.exit(2)

    root = os.path.abspath(args.staging_dir)
    index = os.path.join(root, "index.html")
    if not (os.path.isdir(root) and os.path.isfile(index) and os.path.getsize(index) > 0):
        print(f"ERROR: staging dir invalid: {root}", file=sys.stderr)
        sys.exit(2)

    files = collect_files(root)
    manifest = {url_path: digest for url_path, _abs, digest in files}
    by_hash = {digest: (url_path, abs_path) for url_path, abs_path, digest in files}
    print(f"files: {len(files)}  staged index.html sha256: {manifest['/index.html'][:12]}...")

    # 1. upload JWT
    res = check_ok(api("GET", f"/accounts/{ACCOUNT_ID}/pages/projects/{args.project}/upload-token"), "upload-token")
    jwt = res["jwt"]
    print("upload token ok")

    # 2. which hashes are missing
    hashes = sorted(by_hash)
    res = jwt_api("POST", "/pages/assets/check-missing", jwt, {"hashes": hashes})
    if not res.get("success"):
        raise RuntimeError(f"check-missing failed: {json.dumps(res.get('errors'))[:300]}")
    missing = res["result"] or []
    print(f"missing assets: {len(missing)} of {len(hashes)}")

    # 3. upload missing files, batched
    BATCH = 10
    for i in range(0, len(missing), BATCH):
        batch = missing[i:i + BATCH]
        payload = []
        for h in batch:
            _url_path, abs_path = by_hash[h]
            with open(abs_path, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode()
            payload.append({
                "key": h,
                "value": b64,
                "metadata": {"contentType": content_type(abs_path)},
                "base64": True,
            })
        res = jwt_api("POST", "/pages/assets/upload", jwt, payload, timeout=300)
        if not res.get("success"):
            raise RuntimeError(f"upload batch {i} failed: {json.dumps(res.get('errors'))[:300]}")
        print(f"  uploaded {min(i + BATCH, len(missing))}/{len(missing)}")

    # 4. confirm hashes
    if hashes:
        res = jwt_api("POST", "/pages/assets/upsert-hashes", jwt, {"hashes": hashes})
        if not res.get("success"):
            raise RuntimeError(f"upsert-hashes failed: {json.dumps(res.get('errors'))[:300]}")
    print("assets confirmed")

    # 5. create the deployment
    fields = [
        ("manifest", json.dumps(manifest)),
        ("branch", args.branch),
        ("commit_message", args.commit_message[:2000]),
        ("commit_hash", args.commit_hash[:128]),
        ("commit_dirty", "true"),
    ]
    body, ctype = multipart(fields)
    req = urllib.request.Request(
        BASE + f"/accounts/{ACCOUNT_ID}/pages/projects/{args.project}/deployments",
        data=body, method="POST",
    )
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=[HOST])
    req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req, timeout=300) as resp:
        created = read_json_response(resp)
    dep = check_ok(created, "create deployment")
    print("")
    print(f"DEPLOYED: {dep.get('url')}")
    for alias in dep.get("aliases") or []:
        print(f"  alias: https://{alias}")
    print(f"  id: {dep.get('id')}")
    print(f"  branch: {dep.get('deployment_trigger', {}).get('metadata', {}).get('branch') or args.branch}")


if __name__ == "__main__":
    main()
