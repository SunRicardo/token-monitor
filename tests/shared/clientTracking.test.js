'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let trackingApi = {};
try {
  trackingApi = require('../../src/shared/clientTracking');
} catch (_) {}

const { DEFAULT_CLIENTS, clientsCsvForSetting } = trackingApi;

test('clientsCsvForSetting uses defaults only for missing settings', () => {
  assert.equal(typeof DEFAULT_CLIENTS, 'string');
  assert.equal(typeof clientsCsvForSetting, 'function');
  assert.equal(clientsCsvForSetting(undefined), DEFAULT_CLIENTS);
  assert.equal(clientsCsvForSetting(null), DEFAULT_CLIENTS);
});

test('default tracked clients include Cline', () => {
  assert.ok(DEFAULT_CLIENTS.split(',').includes('cline'));
});

test('clientsCsvForSetting preserves explicit empty tracked-tool selection', () => {
  assert.equal(clientsCsvForSetting(''), '');
  assert.equal(clientsCsvForSetting('  '), '');
});

test('clientsCsvForSetting normalizes saved client csv values', () => {
  assert.equal(clientsCsvForSetting(' Claude , Codex,,hermes '), 'claude,codex,hermes');
});
