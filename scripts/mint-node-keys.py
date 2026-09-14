#!/usr/bin/env python3
"""Mint NODE KEY invite codes (format NODE-7X4K9D).

- Generates N codes from an unambiguous alphabet (no 0/O, 1/I, L).
- Stores ONLY SHA-256 hashes in Supabase (node_keys table).
- Writes plaintext codes to ~/workspace/node-keys/<batch>-codes.txt for Pipe
  to distribute, plus <batch>-ops.sql with per-code revoke lines.
- Never commit the codes file to git.

Usage: mint-node-keys.py [--batch wave-1] [--count 30] [--note "..."]
"""
import argparse
import hashlib
import secrets
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I, L
OUT_DIR = Path.home() / "workspace" / "node-keys"


def canonical(code: str) -> str:
    return code.upper().replace(" ", "").replace("-", "")


def code_hash(code: str) -> str:
    return hashlib.sha256(canonical(code).encode()).hexdigest()


def display(code: str) -> str:
    c = canonical(code)
    return f"{c[:4]}-{c[4:]}"


def sql_via_api(sql: str) -> None:
    sys.path.insert(0, str(Path(__file__).parent))
    from dynamic_credentials import dynamic_credential_entry  # noqa
    import json as _json
    surrogate = dynamic_credential_entry("custom.supabase")["surrogate"].strip()
    proc = subprocess.run(
        ["curl", "-sS", "-m", "90", "-X", "POST",
         "https://api.supabase.com/v1/projects/quwbmhxgteyykujydvii/database/query",
         "-H", "Authorization: Bearer " + surrogate,
         "-H", "Content-Type: application/json",
         "--data-binary", _json.dumps({"query": sql})],
        capture_output=True, text=True, timeout=120,
    )
    body = proc.stdout.strip()
    if '"message":"Failed to run sql query' in body or "ERROR" in body:
        print("SQL FAILED:", body[:2000], file=sys.stderr)
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", default="wave-1")
    ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--note", default="")
    ap.add_argument("--max-uses", type=int, default=1)
    args = ap.parse_args()

    codes = set()
    while len(codes) < args.count:
        codes.add("NODE-" + "".join(secrets.choice(ALPHABET) for _ in range(6)))
    codes = sorted(codes)

    values = ", ".join(
        f"('{code_hash(c)}', '{args.batch}', {args.max_uses}, "
        f"'{args.note.replace(chr(39), chr(39)*2)}')"
        for c in codes
    )
    sql_via_api(
        "insert into public.node_keys (code_hash, label, max_uses, note) "
        f"values {values}"
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{args.batch}-codes.txt").write_text(
        "GRID//NODE NODE KEYS — batch: " + args.batch + "\n"
        "Hand these out. Each is single-use unless noted.\n\n"
        + "\n".join(codes) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / f"{args.batch}-ops.sql").write_text(
        "-- Revoke any key by running its line:\n"
        + "\n".join(
            f"-- revoke {c}:\nupdate public.node_keys set revoked = true "
            f"where code_hash = '{code_hash(c)}';"
            for c in codes
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Minted {len(codes)} codes -> {OUT_DIR}/{args.batch}-codes.txt")
    print("Hashes stored in node_keys; plaintext only in the codes file.")


if __name__ == "__main__":
    main()
