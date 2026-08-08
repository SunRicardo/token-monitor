'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createReasonixNativeSessionCache,
  isReasonixNativeSessionPath,
  isReasonixNativeSessionSidecar,
  readReasonixNativeSession,
  reasonixNativeSessionWatchRoots
} = require('../../src/shared/reasonixSessions');
const { collectUsageOnce, projectIdentity, watchIgnoreMatcher, watchPathsForClients } = require('../../src/shared/collector');
const { syncPayload } = require('../../src/shared/syncPayload');
const { createDeviceState } = require('../../src/shared/deviceState');
const { captureSessionUsageArchive } = require('../../src/shared/sessionUsageArchive');
const { projectRowsForPeriod } = require('../../src/electron/renderer/projectRows');
const { sessionRowsForPeriod } = require('../../src/electron/renderer/sessionRows');
const { composeLocalSyncStats } = require('../../src/electron/syncDisplayStats');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function sidecars(directory, id, meta, telemetry) {
  const metaPath = path.join(directory, `${id}.jsonl.meta`);
  const telemetryPath = path.join(directory, `${id}.jsonl.telemetry.json`);
  if (meta !== undefined) writeJson(metaPath, meta);
  if (telemetry !== undefined) writeJson(telemetryPath, telemetry);
  return { metaPath, telemetryPath };
}

function cacheFor(stateHome, projectIdentity) {
  return createReasonixNativeSessionCache({
    env: { REASONIX_STATE_HOME: stateHome },
    homeDir: path.dirname(stateHome),
    platform: 'linux',
    cwdDir: path.dirname(stateHome),
    projectIdentity
  });
}

function nativeTelemetry(overrides = {}) {
  return {
    promptTokens: 80,
    completionTokens: 30,
    reasoningTokens: 10,
    totalTokens: 140,
    cacheHitTokens: 20,
    cacheMissTokens: 80,
    cacheWriteTokens: 0,
    requestCount: 7,
    sessionCostUsd: 0.25,
    ...overrides
  };
}

test('Reasonix native adapter reads routed and global sidecars without parsing transcript artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-native-'));
  const stateHome = path.join(root, 'state');
  const globalDir = path.join(stateHome, 'sessions');
  const routedDir = path.join(stateHome, 'projects', 'token-monitor', 'sessions');
  const workspaceRoot = path.join(root, 'workspaces', 'token-monitor');
  sidecars(globalDir, 'global-id', {
    id: 'global-id',
    created_at: '2026-08-07T03:00:00.000Z',
    updated_at: '2026-08-08T03:00:00.000Z',
    scope: 'global',
    topic_id: 'topic-1',
    topic_title: 'Automatic topic',
    custom_title: 'My Reasonix session',
    model: 'deepseek/deepseek-v4-flash',
    turns: 4,
    preview: 'preview text',
    schema_version: 1,
    parent_id: 'parent-id',
    fork_turn: 2,
    fork_message_index: 8,
    workspace_root: '/must-not-be-used-for-global-project'
  }, nativeTelemetry());
  sidecars(routedDir, 'project-id', {
    id: 'project-id',
    created_at: '2026-08-08T02:00:00.000Z',
    updated_at: '2026-08-08T04:00:00.000Z',
    scope: 'project',
    workspace_root: workspaceRoot,
    topic_title: 'Topic fallback',
    model: 'deepseek/deepseek-v4-pro',
    turns: 3,
    schema_version: 1
  }, nativeTelemetry({ totalTokens: 141, sessionCostUsd: 0.5, requestCount: 9 }));
  sidecars(globalDir, 'preview-id', {
    id: 'preview-id',
    updated_at: '2026-08-08T05:00:00.000Z',
    preview: 'Preview fallback'
  }, nativeTelemetry({ totalTokens: 1 }));
  sidecars(globalDir, 'name-id', {
    id: 'name-id',
    updated_at: '2026-08-08T05:30:00.000Z',
    name: 'Official branch name'
  }, nativeTelemetry({ totalTokens: 2 }));
  sidecars(globalDir, 'missing-id', { preview: 'skip this' }, nativeTelemetry());
  sidecars(globalDir, 'corrupt-meta', '{not-json', nativeTelemetry());
  sidecars(globalDir, 'corrupt-telemetry', { id: 'corrupt-telemetry' }, '{not-json');
  fs.writeFileSync(path.join(globalDir, 'project-id.jsonl.events.jsonl'), '{"shouldNot":"beRead"}\n');
  fs.writeFileSync(path.join(globalDir, 'project-id.event-index.json'), JSON.stringify({ offsets: [1] }));

  const cache = cacheFor(stateHome, projectIdentity);
  const view = cache.getView({ now: new Date('2026-08-08T12:00:00.000Z') });
  const allTime = view.sessions.allTime;

  assert.deepEqual(Object.keys(allTime).sort(), [
    'reasonix:global-id',
    'reasonix:name-id',
    'reasonix:preview-id',
    'reasonix:project-id'
  ]);
  assert.equal(allTime['reasonix:global-id'].title, 'My Reasonix session');
  assert.equal(allTime['reasonix:name-id'].title, 'Official branch name');
  assert.equal(allTime['reasonix:project-id'].title, 'Topic fallback');
  assert.equal(allTime['reasonix:preview-id'].title, 'Preview fallback');
  assert.equal(allTime['reasonix:project-id'].totalTokens, 141);
  assert.equal(allTime['reasonix:project-id'].reasoningTokens, 10);
  assert.equal(allTime['reasonix:project-id'].completionTokens, 30);
  assert.equal(allTime['reasonix:project-id'].requestCount, 9);
  assert.equal(allTime['reasonix:project-id'].messageCount, 0);
  assert.equal(allTime['reasonix:project-id'].projectLabel, 'token-monitor');
  assert.equal(view.projects.allTime['token-monitor'].tokens, 141);
  assert.equal(view.projects.allTime['token-monitor'].clients.reasonix, 141);
  assert.deepEqual(view.projects.allTime['token-monitor'].sessionIds, ['reasonix:project-id']);
  assert.equal(JSON.stringify(view).includes(stateHome), false);
  assert.equal(JSON.stringify(view).includes(workspaceRoot), false);
});

test('Reasonix native telemetry uses direct total, skips invalid sidecars, and invalidates on update/delete', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-native-cache-'));
  const stateHome = path.join(root, 'state');
  const sessionsDir = path.join(stateHome, 'sessions');
  const paths = sidecars(sessionsDir, 'stable-id', {
    id: 'stable-id',
    updated_at: '2026-08-08T03:00:00.000Z',
    custom_title: 'Before rename'
  }, nativeTelemetry({ totalTokens: 140, promptTokens: 1, completionTokens: 2, reasoningTokens: 99 }));
  const cache = cacheFor(stateHome, () => ({}));
  const now = new Date('2026-08-08T12:00:00.000Z');

  let view = cache.getView({ now });
  assert.equal(view.sessions.allTime['reasonix:stable-id'].totalTokens, 140);
  assert.equal(view.sessions.allTime['reasonix:stable-id'].reasoningTokens, 99);
  assert.equal(view.sessions.allTime['reasonix:stable-id'].completionTokens, 2);
  assert.equal(cache.isDirty(), false);

  fs.writeFileSync(paths.metaPath, JSON.stringify({
    id: 'stable-id',
    updated_at: '2026-08-08T04:00:00.000Z',
    custom_title: 'After rename'
  }));
  cache.invalidate(paths.metaPath);
  view = cache.getView({ now });
  assert.equal(view.sessions.allTime['reasonix:stable-id'].title, 'After rename');

  fs.rmSync(paths.metaPath);
  fs.rmSync(paths.telemetryPath);
  cache.invalidate(paths.metaPath);
  view = cache.getView({ now });
  assert.equal(Object.hasOwn(view.sessions.allTime, 'reasonix:stable-id'), false);
});

test('Reasonix native watcher roots share the resolved state home and ignore stats/events churn', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-native-watch-'));
  const stateHome = path.join(root, 'state');
  const statsDir = path.join(stateHome, 'stats');
  const sessionsDir = path.join(stateHome, 'sessions');
  const projectsDir = path.join(stateHome, 'projects');
  fs.mkdirSync(statsDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });
  const previous = process.env.REASONIX_STATE_HOME;
  process.env.REASONIX_STATE_HOME = stateHome;
  try {
    const roots = reasonixNativeSessionWatchRoots({ env: process.env, homeDir: root, platform: 'linux', cwdDir: root });
    assert.deepEqual(roots, [sessionsDir, projectsDir]);
    assert.equal(isReasonixNativeSessionPath(path.join(sessionsDir, 'a.jsonl.meta'), roots), true);
    assert.equal(isReasonixNativeSessionSidecar('a.jsonl.meta'), true);
    assert.equal(isReasonixNativeSessionSidecar('a.jsonl.events.jsonl'), false);

    const ignored = watchIgnoreMatcher('reasonix');
    assert.equal(typeof ignored, 'function');
    assert.equal(ignored(path.join(sessionsDir, 'a.jsonl.meta')), false);
    assert.equal(ignored(path.join(sessionsDir, 'a.jsonl.telemetry.json')), false);
    assert.equal(ignored(path.join(sessionsDir, 'a.jsonl.events.jsonl')), true);
    assert.equal(ignored(path.join(sessionsDir, 'a.event-index.json')), true);
    assert.equal(ignored(sessionsDir), false);
    assert.deepEqual(watchPathsForClients('reasonix').sort(), [statsDir, projectsDir, sessionsDir].sort());
  } finally {
    if (previous === undefined) delete process.env.REASONIX_STATE_HOME;
    else process.env.REASONIX_STATE_HOME = previous;
  }
});

test('Reasonix native view stays outside aggregate, history, archive and sync payloads', async () => {
  const nativeSession = {
    native: true,
    client: 'reasonix',
    sessionId: 'reasonix:native-id',
    title: 'Native session',
    totalTokens: 999,
    sessionCostUsd: 3,
    messageCount: 0,
    lastUsedAt: '2026-08-08T03:00:00.000Z',
    models: { 'deepseek-v4': 999 }
  };
  const nativeView = {
    sessions: { today: { [nativeSession.sessionId]: nativeSession }, month: {}, allTime: { [nativeSession.sessionId]: nativeSession } },
    projects: { today: {}, month: {}, allTime: {} }
  };
  const nativeCache = { getView: () => nativeView };
  const runTokscale = async () => ({ entries: [{
    client: 'reasonix',
    model: 'deepseek-v4',
    input: 80,
    output: 30,
    cacheRead: 20,
    cacheWrite: 0,
    reasoning: 10,
    costUsd: 0.25
  }] });
  const summary = await collectUsageOnce({
    clients: 'reasonix',
    allTimeSince: '2026-01-01',
    commandTimeoutMs: 1000,
    deviceId: 'native-test',
    runTokscale,
    platform: 'linux',
    historyEnabled: false,
    wslScanEnabled: false,
    reasonixNativeSessionsEnabled: true,
    reasonixNativeSessionCache: nativeCache
  });

  assert.equal(summary.today.totalTokens, 140);
  assert.equal(summary.today.clients.reasonix, 140);
  assert.deepEqual(summary.today.sessions, {});
  assert.equal(summary.nativeSessions.today[nativeSession.sessionId].totalTokens, 999);
  assert.equal(summary.history, null);
  const archive = captureSessionUsageArchive({}, {
    nativeSessions: summary.nativeSessions,
    today: { sessions: {} },
    month: { sessions: {} },
    allTime: { sessions: {} }
  }, new Date(summary.updatedAt));
  assert.deepEqual(archive.sessions, {});

  const payload = syncPayload(summary);
  assert.equal(Object.hasOwn(payload, 'nativeSessions'), false);
  assert.equal(Object.hasOwn(payload, 'nativeProjects'), false);
  assert.doesNotMatch(JSON.stringify(payload), /Native session|reasonix:native-id/);

  const displayStats = composeLocalSyncStats(null, {
    deviceId: 'native-test',
    updatedAt: summary.updatedAt,
    receivedAt: summary.updatedAt,
    today: summary.today,
    month: summary.month,
    allTime: summary.allTime,
    nativeSessions: summary.nativeSessions,
    nativeProjects: summary.nativeProjects
  });
  assert.equal(displayStats.periods.today.totalTokens, 140);
  assert.equal(displayStats.nativeSessions.today[nativeSession.sessionId].totalTokens, 999);

  const records = [];
  const deviceState = createDeviceState({ onRecord: (record) => records.push(record) });
  deviceState.updateUsage({ month: {}, allTime: {}, nativeSessions: nativeView.sessions, nativeProjects: nativeView.projects });
  deviceState.updateUsage({ today: {} }, 'preview', { preview: true });
  assert.equal(records.at(-1).nativeSessions.today[nativeSession.sessionId].totalTokens, 999);
});

test('Reasonix native rows label requests separately from messages and merge project attribution', () => {
  const session = {
    native: true,
    client: 'reasonix',
    sessionId: 'reasonix:row-id',
    title: 'Build a dashboard',
    model: 'deepseek-v4',
    totalTokens: 140,
    promptTokens: 80,
    completionTokens: 30,
    reasoningTokens: 10,
    cacheHitTokens: 20,
    cacheMissTokens: 80,
    requestCount: 4,
    sessionCostUsd: 0.25,
    turns: 2,
    projectLabel: 'Token Monitor',
    lastUsedAt: '2026-08-08T03:00:00.000Z'
  };
  const rows = sessionRowsForPeriod({ sessions: {} }, {
    nativeSessions: { 'reasonix:row-id': session },
    clientLabels: { reasonix: 'Reasonix' },
    clientColors: { reasonix: '#4d6bfe' },
    now: new Date('2026-08-08T12:00:00.000Z')
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'native-session');
  assert.equal(rows[0].name, 'Build a dashboard');
  assert.match(rows[0].subtitle, /2 turns/);
  assert.equal(rows[0].nativeSessionBreakdown.cacheMissTokens, 80);
  assert.equal(rows[0].nativeSessionBreakdown.providerRequests, 4);

  const projects = projectRowsForPeriod({ projects: {} }, {
    nativeProjects: {
      'token monitor': { label: 'Token Monitor', tokens: 140, costUsd: 0.25, clients: { reasonix: 140 } }
    },
    clientLabels: { reasonix: 'Reasonix' },
    clientColors: { reasonix: '#4d6bfe' }
  });
  assert.equal(projects.length, 1);
  assert.equal(projects[0].value, 140);
  assert.deepEqual(projects[0].accordionRows.map(({ key, value }) => ({ key, value })), [{ key: 'reasonix', value: 140 }]);
});

test('readReasonixNativeSession skips missing stable ID and missing/corrupt telemetry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-native-read-'));
  const metaPath = path.join(root, 'session.jsonl.meta');
  const telemetryPath = path.join(root, 'session.jsonl.telemetry.json');
  writeJson(metaPath, { created_at: '2026-08-08T00:00:00.000Z' });
  writeJson(telemetryPath, nativeTelemetry());
  assert.equal(readReasonixNativeSession(metaPath, telemetryPath), null);
  writeJson(metaPath, { id: 'stable' });
  assert.equal(readReasonixNativeSession(metaPath, path.join(root, 'missing')), null);
  fs.writeFileSync(telemetryPath, '{bad');
  assert.equal(readReasonixNativeSession(metaPath, telemetryPath), null);
});
