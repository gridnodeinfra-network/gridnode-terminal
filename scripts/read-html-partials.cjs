#!/usr/bin/env node
// Shared helper: assembled index.html from html/partials/ in pinned order.
// Single source of truth for the order is html/partials/order.json
// (also used by scripts/build.mjs step 0 and test-html-reproducibility.cjs).
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const order = JSON.parse(
  fs.readFileSync(path.join(root, 'html/partials/order.json'), 'utf8')
);
module.exports = {
  order,
  html: order
    .map((name) => fs.readFileSync(path.join(root, 'html/partials', name), 'utf8'))
    .join(''),
};
