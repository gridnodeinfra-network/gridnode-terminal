#!/usr/bin/env python3
"""Run SQL against the Supabase project via the Management API query endpoint.

Usage:
    supabase-sql.py "select 1"
    supabase-sql.py --file migration.sql

Uses the stored custom.supabase connector credential via the dynamic
credential surrogate exchange. Never handles the raw token. Reads SQL from
argv or a file; nothing secret goes through here (service role is not needed:
the management query endpoint runs with full privileges).
"""
import json
import subprocess
import sys

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import dynamic_credential_entry

PROJECT_REF = "quwbmhxgteyykujydvii"
BASE = "https://api.supabase.com"


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: supabase-sql.py <sql> | --file <path>", file=sys.stderr)
        sys.exit(2)
    if sys.argv[1] == "--file":
        with open(sys.argv[2], "r", encoding="utf-8") as fh:
            sql = fh.read()
    else:
        sql = sys.argv[1]

    surrogate = dynamic_credential_entry("custom.supabase")["surrogate"].strip()
    proc = subprocess.run(
        [
            "curl", "-sS", "-m", "90", "-X", "POST",
            f"{BASE}/v1/projects/{PROJECT_REF}/database/query",
            "-H", "Authorization: Bearer " + surrogate,
            "-H", "Content-Type: application/json",
            "--data-binary", json.dumps({"query": sql}),
            "-w", "\n__HTTP__:%{http_code}",
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    out = proc.stdout
    if "\n__HTTP__:" in out:
        body, _, code = out.rpartition("\n__HTTP__:")
    else:
        body, code = out, "???"
    print(f"HTTP {code.strip()}")
    print(body.strip()[:8000])
    if proc.returncode != 0:
        print(proc.stderr.strip()[:1000], file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
