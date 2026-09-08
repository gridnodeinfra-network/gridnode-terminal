#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

const picker = html.match(/<div class="cp-select" id="cpShotMed">([\s\S]*?)<\/div>\s*<\/div>/);
if (!picker) throw new Error('FAIL medication picker markup is present');

if (!/data-gn-med-minimized/.test(picker[0])) {
  throw new Error('FAIL medication picker declares its minimized state');
}

if (!/\[data-gn-med-minimized\]\s+\.cp-group-options:not\(\.gn-revealed\)\s*\{\s*display:none/.test(html)) {
  throw new Error('FAIL collapsed medication groups are removed from hit testing');
}

console.log('medication-picker-contract OK');
