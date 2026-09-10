#!/usr/bin/env node
// Shared helper: concatenated js/modules/ source in pinned order.
// Single source of truth for the order is js/modules/order.json
// (also used by scripts/build-bundle.sh and scripts/build-bundle.ps1).
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const order = JSON.parse(
  fs.readFileSync(path.join(root, 'js/modules/order.json'), 'utf8')
);
module.exports = order
  .map((name) => fs.readFileSync(path.join(root, 'js/modules', name), 'utf8'))
  .join('');
