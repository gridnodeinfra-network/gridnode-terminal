#!/usr/bin/env node
// GRID//NODE ACCESS//GATE — beta invite admin CLI.
//
// Commands:
//   npm run beta:invite -- --count 5
//   npm run beta:invite -- --count 5 --max-uses 3 --ttl 14d
//   npm run beta:list
//   npm run beta:revoke -- <invite-id>
//
// Environment:
//   SUPABASE_URL            — required for the production / staging target
//   SUPABASE_SERVICE_ROLE_KEY — required
//   BETA_ADMIN_LOG          — optional. Defaults to stdout. Pass a path to
//                             write a metadata-only log to disk (no raw codes).
//
// SECURITY:
//   - Raw codes are NEVER stored. Only HMAC-SHA256(code, BETA_HMAC_SECRET) is
//     written to the DB.
//   - BETA_HMAC_SECRET MUST match the secret the pages function uses at runtime.
//     If unset, this CLI derives a development fallback from the hostname so
//     local dev works; do NOT use the dev fallback in production.
//   - Raw codes are printed to stdout ONCE and never re-displayed. The CLI does
//     not write them to a file. The user is expected to copy them to a
//     password manager or paste directly into a tester handoff document.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const HMAC_SECRET = process.env.BETA_HMAC_SECRET || '';
const LOG_PATH = process.env.BETA_ADMIN_LOG || '';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 31 chars; excludes O/0/I/1
const CODE_FORMAT = /^NODE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

function die(label, msg, code = 1) {
  console.error(`[beta-admin] ${label}: ${msg}`);
  process.exit(code);
}

function info(msg) {
  console.log(`[beta-admin] ${msg}`);
}

function requireEnv() {
  if (!SUPABASE_URL) die('FATAL', 'SUPABASE_URL not set. Set the environment variable before running.');
  if (!SERVICE_KEY) die('FATAL', 'SUPABASE_SERVICE_ROLE_KEY not set. Use the service role key (server-side only).');
  if (!HMAC_SECRET) {
    die('FATAL', 'BETA_HMAC_SECRET not set. This secret MUST match the runtime GATE_AUDIT_SECRET.');
  }
}

function serviceHeaders() {
  return {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function hashCode(code) {
  // HMAC-SHA256(code, secret). Server-side verifies the same way.
  return crypto.createHmac('sha256', HMAC_SECRET).update(code).digest();
}

function generateCode() {
  // 8 chars from the 31-char alphabet, in two groups of 4.
  const buf = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return `NODE-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (!CODE_FORMAT.test(trimmed)) return null;
  return trimmed;
}

function parseDuration(s) {
  // '7d', '14d', '24h', '30m'
  const m = s.match(/^(\d+)([dhms])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const factor = { d: 86400, h: 3600, m: 60, s: 1 }[unit];
  return n * factor * 1000;
}

function appendToLog(metadata) {
  if (!LOG_PATH) return;
  let line = '';
  try {
    line = JSON.stringify({ ...metadata, timestamp: new Date().toISOString() }) + '\n';
  } catch (e) {
    return;
  }
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    // best-effort
  }
}

function isLocalDev() {
  // Treat loopback / 127.0.0.1 / localhost URLs as the local dev server, which
  // exposes admin endpoints at /api/_dev/*. The production deploy uses real
  // Supabase's PostgREST endpoints at /rest/v1.
  return SUPABASE_URL.startsWith('http://127.0.0.1') || SUPABASE_URL.startsWith('http://localhost');
}

async function adminRequest(path, init) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, { ...init, headers: { ...serviceHeaders(), ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function supabaseRequest(path, init) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, { ...init, headers: { ...serviceHeaders(), ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function createInvite({ maxUses, ttlMs }) {
  if (isLocalDev()) {
    // Use the dev server's admin endpoint. The dev server generates the raw
    // code and returns it. The CLI's hash is not used here; the dev server
    // hashes the code with the same HMAC secret.
    const rows = await adminRequest('/api/_dev/invite', {
      method: 'POST',
      body: JSON.stringify({ count: 1, max_uses: maxUses, ttl_ms: ttlMs })
    });
    const inv = rows.invites[0];
    return { id: inv.id, code: inv.code, codeHash: '(see dev server)', expiresAt: inv.expires_at };
  }
  const code = generateCode();
  const codeHash = hashCode(code); // Buffer
  const buf = Buffer.from(codeHash);
  const codeHashBytea = '\\x' + buf.toString('hex');

  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const body = JSON.stringify({
    code_hash: codeHashBytea,
    max_uses: maxUses,
    expires_at: expiresAt
  });
  const rows = await supabaseRequest('/rest/v1/beta_invites', {
    method: 'POST',
    body
  });
  const id = Array.isArray(rows) ? rows[0]?.id : undefined;
  return { id, code, codeHash: bytesToHex(codeHash), expiresAt };
}

async function listInvites() {
  if (isLocalDev()) {
    const rows = await adminRequest('/api/_dev/list', { method: 'GET' });
    return (rows.invites || []).map((i) => ({
      id: i.id,
      status: i.status,
      uses: i.uses,
      max_uses: i.max_uses,
      expires_at: i.expires_at,
      created_at: i.created_at,
      claimed_at: i.claimed_at,
      revoked_at: i.revoked_at
    }));
  }
  const rows = await supabaseRequest(
    '/rest/v1/beta_invites?select=id,status,uses,max_uses,expires_at,created_at,claimed_at,revoked_at&order=created_at.desc&limit=500',
    { method: 'GET' }
  );
  return rows || [];
}

async function revokeInvite(id) {
  if (isLocalDev()) {
    const rows = await adminRequest('/api/_dev/revoke', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    return rows.ok === true;
  }
  // Use the SECURITY DEFINER RPC so the cascade is atomic.
  const rows = await supabaseRequest('/rest/v1/rpc/revoke_beta_invite', {
    method: 'POST',
    body: JSON.stringify({ p_invite_id: id })
  });
  return Array.isArray(rows) ? rows[0] === true : false;
}

function parseArgs(argv) {
  // Tiny argv parser supporting `--key value` and `--flag` and positional args.
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fmtTable(rows) {
  const cols = ['ID', 'STATUS', 'USES', 'MAX', 'EXPIRES', 'CREATED', 'CLAIMED', 'REVOKED'];
  const widths = [36, 12, 6, 6, 24, 24, 24, 24];
  const out = [];
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  out.push(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  out.push(sep);
  for (const r of rows) {
    out.push([
      (r.id || '').padEnd(widths[0]),
      (r.status || '').padEnd(widths[1]),
      String(r.uses || 0).padEnd(widths[2]),
      String(r.max_uses || 0).padEnd(widths[3]),
      (r.expires_at || '').replace('T', ' ').slice(0, 19).padEnd(widths[4]),
      (r.created_at || '').replace('T', ' ').slice(0, 19).padEnd(widths[5]),
      (r.claimed_at || '').replace('T', ' ').slice(0, 19).padEnd(widths[6]),
      (r.revoked_at || '').replace('T', ' ').slice(0, 19).padEnd(widths[7])
    ].join('  '));
  }
  return out.join('\n');
}

async function cmdInvite(args) {
  const count = parseInt(args.flags.count || '1', 10);
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    die('ARG', `--count must be 1-100 (got ${args.flags.count})`);
  }
  const maxUses = parseInt(args.flags['max-uses'] || '1', 10);
  if (!Number.isFinite(maxUses) || maxUses < 1) {
    die('ARG', `--max-uses must be >= 1 (got ${args.flags['max-uses']})`);
  }
  const ttlStr = args.flags.ttl || '14d';
  const ttlMs = parseDuration(ttlStr);
  if (!ttlMs) die('ARG', `--ttl must be like 14d, 24h, 30m (got ${ttlStr})`);

  info(`Generating ${count} invite(s) (max_uses=${maxUses}, ttl=${ttlStr})`);

  const results = [];
  for (let i = 0; i < count; i++) {
    let attempt = 0;
    // Re-roll on the astronomically-unlikely collision.
    while (true) {
      try {
        const r = await createInvite({ maxUses, ttlMs });
        results.push(r);
        break;
      } catch (e) {
        if (e.message.includes('409') && attempt < 3) {
          attempt++;
          continue;
        }
        throw e;
      }
    }
  }

  const banner = 'GRID//NODE // FOUNDING ACCESS';
  console.log('');
  console.log(banner);
  console.log('');
  for (const r of results) {
    console.log(`  ${r.id}   ${r.code}`);
  }
  console.log('');
  console.log('SAVE THESE NOW — RAW CODES ARE NOT STORED.');
  console.log('Each code is single-use by default (max_uses=' + maxUses + ').');
  console.log('Expires: ' + results[0].expiresAt.replace('T', ' ').slice(0, 19));
  console.log('');

  // Log metadata only (no raw codes).
  for (const r of results) {
    appendToLog({
      action: 'invite.create',
      id: r.id,
      code_hash_first8: r.codeHash.slice(0, 8),
      max_uses: maxUses,
      expires_at: r.expiresAt
    });
  }
}

async function cmdList(_args) {
  const rows = await listInvites();
  if (!rows.length) {
    console.log('No invites found.');
    return;
  }
  console.log(fmtTable(rows));
  console.log('\nTotal: ' + rows.length);
}

async function cmdRevoke(args) {
  const id = args._[0];
  if (!id) die('ARG', 'invite-id required. Usage: npm run beta:revoke -- <invite-id>');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    die('ARG', 'invite-id must be a UUID');
  }
  const ok = await revokeInvite(id);
  if (ok) {
    console.log(`OK: invite ${id} revoked. All outstanding sessions for this invite are now invalid.`);
    appendToLog({ action: 'invite.revoke', id });
  } else {
    die('REJECTED', `invite ${id} was already revoked or not found. No change made.`);
  }
}

async function main() {
  const cmd = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  switch (cmd) {
    case 'invite':
      requireEnv();
      await cmdInvite(args);
      break;
    case 'list':
      requireEnv();
      await cmdList(args);
      break;
    case 'revoke':
      requireEnv();
      await cmdRevoke(args);
      break;
    default:
      console.error('Usage:');
      console.error('  beta-admin.js invite --count N [--max-uses M] [--ttl 14d]');
      console.error('  beta-admin.js list');
      console.error('  beta-admin.js revoke <invite-id>');
      process.exit(1);
  }
}

main().catch((e) => {
  die('ERROR', e.message || String(e));
});
