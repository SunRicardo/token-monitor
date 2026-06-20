'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  homeLimitAccounts,
  homeModelRows,
  homeActivityWheelRoute,
  homeTrendSummary
} = require('../../src/electron/renderer/homeOverview');

test('homeLimitAccounts keeps account windows together and sorts lowest remaining first', () => {
  const rows = homeLimitAccounts([
    {
      key: 'codex:1',
      providerId: 'codex',
      name: 'linus@example.com',
      color: '#49a3b0',
      windows: [
        { kind: 'session', usedPercent: 30 },
        { kind: 'weekly', usedPercent: 5 }
      ]
    },
    {
      key: 'codex:0',
      providerId: 'codex',
      name: 'javis@example.com',
      color: '#49a3b0',
      windows: [
        { kind: 'weekly', usedPercent: 57, resetDescription: '4d 13h' },
        { kind: 'session', usedPercent: 100, resetDescription: '32m' }
      ]
    }
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'javis@example.com');
  assert.equal(rows[0].providerId, 'codex');
  assert.equal(rows[0].lowestRemaining, 0);
  assert.deepEqual(rows[0].windows.map((window) => window.kind), ['session', 'weekly']);
  assert.deepEqual(rows[0].windows.map((window) => window.remainingPercent), [0, 43]);
  assert.equal(rows[1].lowestRemaining, 70);
});

test('homeLimitAccounts keeps a real billing remaining percentage fallback', () => {
  const rows = homeLimitAccounts([
    {
      key: 'opencode:0',
      name: 'OpenCode',
      windows: [
        { kind: 'billing', remainingPercent: 93, resetDescription: '15d 16h' },
        { kind: 'balance', showMeter: false, remaining: 20 }
      ]
    }
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].windows.map((window) => ({ kind: window.kind, remainingPercent: window.remainingPercent })), [
    { kind: 'billing', remainingPercent: 93 }
  ]);
});

test('homeModelRows returns one-line token shares without cost fields', () => {
  const rows = homeModelRows([
    { name: 'claude-opus-4-8', value: 34_000_000, cost: 21.96, color: '#cc7c5e' },
    { name: 'gpt-5.5', value: 29_800_000, cost: 25.88, color: '#49a3b0' }
  ], 63_800_000);

  assert.deepEqual(rows, [
    { key: 'claude-opus-4-8', name: 'claude-opus-4-8', value: 34_000_000, share: 34_000_000 / 63_800_000, color: '#cc7c5e' },
    { key: 'gpt-5.5', name: 'gpt-5.5', value: 29_800_000, share: 29_800_000 / 63_800_000, color: '#49a3b0' }
  ]);
  assert.equal(Object.hasOwn(rows[0], 'cost'), false);
});

test('homeTrendSummary returns the peak value and real date anchors', () => {
  const summary = homeTrendSummary([
    { date: '2026-05-07', tokens: 20 },
    { date: '2026-05-23', tokens: 80 },
    { date: '2026-06-20', tokens: 40 }
  ]);

  assert.deepEqual(summary, {
    peak: 80,
    dates: ['2026-05-07', '2026-05-23', '2026-06-20']
  });
});

test('homeActivityWheelRoute sends vertical wheel gestures back to Home scrolling', () => {
  assert.equal(homeActivityWheelRoute({ deltaX: 2, deltaY: 40 }), 'home-vertical');
  assert.equal(homeActivityWheelRoute({ deltaX: 40, deltaY: 2 }), 'activity-horizontal');
  assert.equal(homeActivityWheelRoute({ deltaX: 0, deltaY: 40, shiftKey: true }), 'activity-horizontal');
});
