#!/usr/bin/env node
// Shared helper: concatenated css/native/ source in pinned cascade order.
// Single source of truth for the order is css/native/order.json
// (also used by index.html <link> tags, sw.js SHELL, and js/gridnode-native.js injectCss).
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const order = JSON.parse(
  fs.readFileSync(path.join(root, 'css/native/order.json'), 'utf8')
);
module.exports = {
  order,
  css: order
    .map((name) => fs.readFileSync(path.join(root, 'css/native', name), 'utf8'))
    .join(''),
};
