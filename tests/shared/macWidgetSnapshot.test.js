'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAC_WIDGET_SCHEMA_VERSION,
  buildMacWidgetSnapshot,
  serializeMacWidgetSnapshot
} = require('../../src/shared/macWidgetSnapshot');

const NOW = '2026-07-16T08:30:00.000Z';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

test('builds a stable versioned snapshot from aggregate stats', () => {
  const snapshot = buildMacWidgetSnapshot({
    periods: {
      today: {
        totalTokens: 1200.4,
        costUsd: 1.25,
        clients: { codex: 1000, claude: 200 },
        clientCosts: { codex: 1, claude: 0.25 }
      }
    },
    limits: {
      providers: [{
        provider: 'codex',
        status: 'ok',
        updatedAt: '2026-07-16T08:00:00Z',
        windows: [{
          kind: 'weekly',
          usedPercent: 35,
          resetsAt: '2026-07-20T00:00:00Z',
          windowMinutes: 10080
        }]
      }]
    }
  }, { now: NOW });

  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    generatedAt: NOW,
    today: { totalTokens: 1200, costUsd: 1.25 },
    tools: [
      { id: 'codex', totalTokens: 1000, costUsd: 1 },
      { id: 'claude', totalTokens: 200, costUsd: 0.25 }
    ],
    limits: [{
      provider: 'codex',
      status: 'ok',
      updatedAt: '2026-07-16T08:00:00.000Z',
      windows: [{
        kind: 'weekly',
        usedPercent: 35,
        remainingPercent: 65,
        resetsAt: '2026-07-20T00:00:00.000Z',
        windowMinutes: 10080
      }]
    }]
  });
  assert.equal(snapshot.schemaVersion, MAC_WIDGET_SCHEMA_VERSION);
});

test('returns a complete empty snapshot for missing data and limits', () => {
  assert.deepEqual(buildMacWidgetSnapshot({}, { now: NOW }), {
    schemaVersion: 1,
    generatedAt: NOW,
    today: { totalTokens: 0, costUsd: 0 },
    tools: [],
    limits: []
  });
});

test('normalizes invalid numeric data and clamps percentages', () => {
  const snapshot = buildMacWidgetSnapshot({
    periods: {
      today: {
        totalTokens: Infinity,
        costUsd: -3,
        clients: { codex: -1, claude: 'not-a-number', cursor: '25' },
        clientCosts: { cursor: Infinity }
      }
    },
    limits: {
      providers: [{
        provider: 'claude',
        status: 'ok',
        windows: [
          { kind: 'session', usedPercent: 150, remainingPercent: -10, windowMinutes: -5 },
          { kind: 'weekly', usedPercent: 'bad', remainingPercent: Infinity },
          { kind: 'unknown', usedPercent: 10 }
        ]
      }]
    }
  }, { now: NOW });

  assert.deepEqual(snapshot.today, { totalTokens: 0, costUsd: 0 });
  assert.deepEqual(snapshot.tools, [{ id: 'cursor', totalTokens: 25, costUsd: 0 }]);
  assert.deepEqual(snapshot.limits[0].windows, [
    { kind: 'session', usedPercent: 100, remainingPercent: 0, resetsAt: null, windowMinutes: 0 },
    { kind: 'weekly', usedPercent: null, remainingPercent: null, resetsAt: null, windowMinutes: null }
  ]);
});

test('preserves multiple provider accounts without exporting account identity', () => {
  const snapshot = buildMacWidgetSnapshot({
    limits: {
      providers: [
        { provider: 'codex', status: 'ok', accountEmail: 'first@example.com', accountKey: 'secret-a' },
        { provider: 'codex', status: 'unauthorized', accountName: 'Second Person', accountKey: 'secret-b' }
      ]
    }
  }, { now: NOW });

  assert.equal(snapshot.limits.length, 2);
  assert.deepEqual(snapshot.limits.map(({ provider, status }) => ({ provider, status })), [
    { provider: 'codex', status: 'ok' },
    { provider: 'codex', status: 'unauthorized' }
  ]);
  const json = JSON.stringify(snapshot);
  for (const secret of ['first@example.com', 'secret-a', 'Second Person', 'secret-b']) {
    assert.ok(!json.includes(secret));
  }
});

test('uses allowlists so sensitive and unknown fields never enter the serialized snapshot', () => {
  const sensitiveValues = [
    'sk-private-api-key',
    'session-cookie-value',
    'person@example.com',
    'private prompt contents',
    'conversation transcript',
    '/Users/person/.config/credentials.json'
  ];
  const stats = {
    apiKey: sensitiveValues[0],
    cookie: sensitiveValues[1],
    accountEmail: sensitiveValues[2],
    prompt: sensitiveValues[3],
    conversation: sensitiveValues[4],
    credentialPath: sensitiveValues[5],
    periods: {
      today: {
        totalTokens: 10,
        clients: { codex: 10, 'person@example.com': 999 },
        sessions: { secret: { prompt: sensitiveValues[3] } }
      }
    },
    limits: {
      providers: [{
        provider: 'codex',
        status: 'ok',
        token: sensitiveValues[0],
        cookie: sensitiveValues[1],
        accountEmail: sensitiveValues[2],
        credentialPath: sensitiveValues[5],
        windows: [{ kind: 'session', usedPercent: 20, label: sensitiveValues[2] }]
      }, {
        provider: sensitiveValues[2],
        status: 'ok'
      }]
    }
  };

  const serialized = serializeMacWidgetSnapshot(stats, { now: NOW });
  for (const sensitive of sensitiveValues) assert.ok(!serialized.includes(sensitive));
  assert.deepEqual(JSON.parse(serialized).tools, [{ id: 'codex', totalTokens: 10, costUsd: 0 }]);
});

test('does not mutate the input object', () => {
  const stats = deepFreeze({
    periods: { today: { totalTokens: 5, clients: { codex: 5 }, clientCosts: { codex: 0.01 } } },
    limits: { providers: [{ provider: 'codex', status: 'ok', windows: [{ kind: 'session', usedPercent: 1 }] }] }
  });
  const before = JSON.stringify(stats);
  assert.doesNotThrow(() => buildMacWidgetSnapshot(stats, { now: NOW }));
  assert.equal(JSON.stringify(stats), before);
});

test('serializer emits valid newline-terminated JSON with the schema version', () => {
  const serialized = serializeMacWidgetSnapshot(null, { now: NOW });
  assert.ok(serialized.endsWith('\n'));
  assert.equal(JSON.parse(serialized).schemaVersion, MAC_WIDGET_SCHEMA_VERSION);
});
