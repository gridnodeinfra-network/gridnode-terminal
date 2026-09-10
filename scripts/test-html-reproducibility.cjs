#!/usr/bin/env node
// Phase 3 refactor guard: the committed index.html must be byte-identical to
// the assembly of html/partials/ in pinned order. If someone edits index.html
// directly instead of the partials, this fails and the next build would
// silently overwrite their edit.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const { html: assembled, order } = require('./read-html-partials.cjs');
const committed = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(
  digest(assembled),
  digest(committed),
  `index.html does not match html/partials/ assembly (${order.length} partials) — edit the partials, not index.html, then rebuild`
);

console.log(`html-reproducibility OK · ${order.length} partials · ${digest(committed)}`);
