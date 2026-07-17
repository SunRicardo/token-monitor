'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAC_WIDGET_SCHEMA_VERSION,
  buildMacWidgetSnapshot,
  serializeMacWidgetSnapshot
} = require('../../src/shared/macWidgetSnapshot');

const NOW = '2026-07-17T08:30:00.000Z';

function sampleStats() {
  return {
    updatedAt: '2026-07-17T08:25:00.000Z',
    periods: {
      today: {
        totalTokens: 1_200_000,
        costUsd: 1.25,
        clients: { codex: 1_000_000, claude: 200_000 },
        clientCosts: { codex: 1, claude: 0.25 },
        models: { 'gpt-5.6': 900_000, 'MiMo V2 Pro': 300_000 },
        modelCosts: { 'gpt-5.6': 1, 'MiMo V2 Pro': 0.25 }
      },
      month: { totalTokens: 9_000_000, costUsd: 8 },
      allTime: { totalTokens: 20_000_000, costUsd: 16 }
    },
    limits: {
      providers: [{
        provider: 'codex',
        status: 'ok',
        accountEmail: 'private@example.com',
        windows: [{ kind: 'weekly', usedPercent: 35, resetsAt: '2026-07-20T00:00:00Z' }]
      }, { provider: 'claude', status: 'notConfigured', windows: [] }]
    },
    historyPreview: {
      daily: [
        { date: '2026-07-15', tokens: 100, cost: 0.1, perClient: { secret: 1 } },
        { date: '2026-07-16', tokens: 200, cost: 0.2 },
        { date: '2026-07-17', tokens: 50, cost: 0.05 }
      ],
      summary: { activeDays: 3, favoriteModel: 'private-model' }
    }
  };
}

test('builds schema v3 overview, quota, models, activity, trend and presentation', () => {
  const snapshot = buildMacWidgetSnapshot(sampleStats(), {
    now: NOW,
    presentation: {
      defaultPeriod: 'today', currencyCode: 'CNY', currencyRate: 7.1,
      compactNumbers: true, showCost: true, locale: 'zh-CN', theme: 'custom'
    }
  });

  assert.equal(snapshot.schemaVersion, MAC_WIDGET_SCHEMA_VERSION);
  assert.equal(MAC_WIDGET_SCHEMA_VERSION, 3);
  assert.deepEqual(snapshot.overview, {
    currentPeriod: 'today', totalTokens: 1_200_000, costUsd: 1.25,
    primaryTool: 'codex', updatedAt: '2026-07-17T08:25:00.000Z'
  });
  assert.equal(snapshot.periods.day.overview.totalTokens, 1_200_000);
  assert.equal(snapshot.periods.month.overview.totalTokens, 9_000_000);
  assert.equal(snapshot.periods.total.overview.totalTokens, 20_000_000);
  assert.deepEqual(snapshot.quota[0].windows[0], {
    kind: 'weekly', usedPercent: 35, remainingPercent: 65,
    resetsAt: '2026-07-20T00:00:00.000Z', windowMinutes: null
  });
  assert.deepEqual(snapshot.models.map((model) => [model.displayName, model.totalTokens, model.sharePercent]), [
    ['gpt-5.6', 900_000, 75], ['MiMo V2 Pro', 300_000, 25]
  ]);
  assert.equal(snapshot.activity.activeDays, 3);
  assert.deepEqual(snapshot.activity.days.map((day) => day.intensity), [2, 4, 1]);
  assert.equal(snapshot.trend.currentTokens, 50);
  assert.equal(snapshot.trend.peakTokens, 200);
  assert.deepEqual(snapshot.presentation, {
    defaultPeriod: 'today', currencyCode: 'CNY', currencySymbol: '¥', currencyRate: 7.1,
    numberStyle: 'compact', showCost: true, locale: 'zh-CN', theme: 'custom'
  });
  assert.equal(snapshot.status.noData, false);
  assert.equal(snapshot.status.isStale, false);
});

test('chooses the configured period without duplicating aggregation logic', () => {
  const snapshot = buildMacWidgetSnapshot(sampleStats(), {
    now: NOW,
    presentation: { defaultPeriod: 'month' }
  });
  assert.equal(snapshot.overview.currentPeriod, 'month');
  assert.equal(snapshot.overview.totalTokens, 9_000_000);
  assert.equal(snapshot.periods.day.overview.totalTokens, 1_200_000);
  assert.equal(snapshot.periods.total.overview.totalTokens, 20_000_000);
});

test('keeps day, month and total model data independent', () => {
  const stats = sampleStats();
  stats.periods.month.models = { 'month-model': 7_000_000 };
  stats.periods.allTime.models = { 'total-model': 18_000_000 };
  const snapshot = buildMacWidgetSnapshot(stats, { now: NOW });

  assert.deepEqual(snapshot.periods.day.models.map((model) => model.displayName), ['gpt-5.6', 'MiMo V2 Pro']);
  assert.deepEqual(snapshot.periods.month.models.map((model) => model.displayName), ['month-model']);
  assert.deepEqual(snapshot.periods.total.models.map((model) => model.displayName), ['total-model']);
});

test('returns a complete empty schema and stale status for missing or old data', () => {
  const empty = buildMacWidgetSnapshot({}, { now: NOW });
  assert.equal(empty.schemaVersion, 3);
  assert.equal(empty.overview.totalTokens, 0);
  assert.equal(empty.periods.day.overview.totalTokens, 0);
  assert.equal(empty.periods.month.overview.totalTokens, 0);
  assert.equal(empty.periods.total.overview.totalTokens, 0);
  assert.deepEqual(empty.quota, []);
  assert.deepEqual(empty.models, []);
  assert.equal(empty.status.noData, true);

  const stale = buildMacWidgetSnapshot({ updatedAt: '2026-07-17T07:00:00Z' }, { now: NOW });
  assert.equal(stale.status.isStale, true);
  assert.equal(stale.status.dataAgeSeconds, 5400);
});

test('normalizes invalid values, statuses, names, and percentages', () => {
  const snapshot = buildMacWidgetSnapshot({
    periods: { today: {
      totalTokens: Infinity,
      costUsd: -1,
      models: { '/Users/person/private.db': 50, 'safe-model': 25, 'person@example.com': 10 }
    } },
    limits: { providers: [{ provider: 'claude', status: 'internalState', windows: [
      { kind: 'session', usedPercent: 150, remainingPercent: -10, windowMinutes: -5 },
      { kind: 'unknown', usedPercent: 10 }
    ] }] }
  }, { now: NOW });
  assert.equal(snapshot.overview.totalTokens, 0);
  assert.deepEqual(snapshot.models.map((model) => model.displayName), ['safe-model']);
  assert.equal(snapshot.quota[0].status, 'error');
  assert.deepEqual(snapshot.quota[0].windows[0], {
    kind: 'session', usedPercent: 100, remainingPercent: 0, resetsAt: null, windowMinutes: 0
  });
});

test('uses explicit allowlists so secrets, identities and raw history never enter App Group', () => {
  const sensitive = [
    'sk-private-api-key', 'session-cookie-value', 'private@example.com',
    'private prompt contents', 'conversation transcript', '/Users/person/private.db'
  ];
  const stats = sampleStats();
  Object.assign(stats, {
    apiKey: sensitive[0], cookie: sensitive[1], prompt: sensitive[3],
    conversation: sensitive[4], credentialPath: sensitive[5]
  });
  stats.periods.today.sessions = { secret: { prompt: sensitive[3] } };
  stats.historyPreview.daily[0].prompt = sensitive[3];
  stats.limits.providers[0].token = sensitive[0];
  stats.limits.providers[0].cookie = sensitive[1];

  const serialized = serializeMacWidgetSnapshot(stats, { now: NOW });
  for (const value of sensitive) assert.equal(serialized.includes(value), false);
  assert.equal(serialized.endsWith('\n'), true);
  assert.equal(JSON.parse(serialized).schemaVersion, 3);
});

test('provider status summarizes configuration and login requirements without identity', () => {
  const snapshot = buildMacWidgetSnapshot({
    limits: { providers: [
      { provider: 'codex', status: 'unauthorized', accountKey: 'private-key' },
      { provider: 'claude', status: 'notConfigured' }
    ] }
  }, { now: NOW });
  assert.equal(snapshot.status.providerConfigured, true);
  assert.equal(snapshot.status.providerNeedsLogin, true);
  assert.equal(JSON.stringify(snapshot).includes('private-key'), false);
});
