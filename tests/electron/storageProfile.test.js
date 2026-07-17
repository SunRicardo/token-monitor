'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CLONE_ENTRIES,
  MANIFEST_NAME,
  cloneComplete,
  cloneDevelopmentData,
  excludedCloneEntry,
  initializeStorageProfile,
  resolveStorageProfile,
  storagePaths
} = require('../../src/electron/storageProfile');

function fixture(label = 'storage profile') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  const appDataRoot = path.join(root, 'Application Support 中文');
  const paths = storagePaths({ appDataRoot, profile: 'development-clone' });
  fs.mkdirSync(paths.productionRoot, { recursive: true });
  fs.writeFileSync(path.join(paths.productionRoot, 'settings.json'), JSON.stringify({
    language: 'zh-CN',
    secret: 'fixture-secret-never-logged',
    codexManagedAccounts: [{ id: 'codex-test', homePath: '/source/home', authPath: '/source/auth.json' }]
  }));
  fs.writeFileSync(path.join(paths.productionRoot, 'hub-devices.json'), '{"version":1,"devices":{"windows-fixture":{}}}');
  fs.writeFileSync(path.join(paths.productionRoot, 'session-usage-archive.json'), '{"version":1}');
  fs.mkdirSync(path.join(paths.productionRoot, 'mimo-credentials'), { recursive: true });
  fs.writeFileSync(path.join(paths.productionRoot, 'mimo-credentials', 'opaque.cookie'), 'opaque-value');
  fs.mkdirSync(path.join(paths.productionRoot, 'managed-codex-homes', 'codex-test'), { recursive: true });
  fs.writeFileSync(path.join(paths.productionRoot, 'managed-codex-homes', 'codex-test', 'auth.json'), 'opaque-auth');
  fs.mkdirSync(path.join(paths.productionRoot, 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(paths.productionRoot, 'Cache', 'cache.bin'), 'cache');
  fs.writeFileSync(path.join(paths.productionRoot, 'SingletonLock'), 'lock');
  return { root, appDataRoot, paths };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('resolves production by default and validates explicit profiles', () => {
  assert.equal(resolveStorageProfile({ env: {} }), 'production');
  assert.equal(resolveStorageProfile({ env: { TOKEN_MONITOR_PROFILE: 'development-clone' } }), 'development-clone');
  assert.equal(resolveStorageProfile({ env: { TOKEN_MONITOR_PROFILE: 'clean' } }), 'clean');
  assert.throws(() => resolveStorageProfile({ env: { TOKEN_MONITOR_PROFILE: 'unsafe' } }), /Unsupported/);
});

test('keeps production at the legacy directory and isolates clone and clean roots', () => {
  const root = path.join('/tmp', 'Application Support');
  const production = storagePaths({ appDataRoot: root, profile: 'production' });
  const development = storagePaths({ appDataRoot: root, profile: 'development-clone' });
  const clean = storagePaths({ appDataRoot: root, profile: 'clean' });
  assert.equal(production.dataRoot, path.join(root, 'Token Monitor'));
  assert.notEqual(development.dataRoot, production.dataRoot);
  assert.notEqual(clean.dataRoot, production.dataRoot);
  assert.notEqual(clean.dataRoot, development.dataRoot);
});

test('first clone copies business data, rewrites managed paths, and excludes caches and locks', () => {
  const { root, paths } = fixture();
  try {
    const sourceMtime = fs.statSync(path.join(paths.productionRoot, 'settings.json')).mtimeMs;
    const result = cloneDevelopmentData({
      sourceRoot: paths.productionRoot,
      targetRoot: paths.dataRoot,
      isProductionRunning: () => false,
      now: new Date('2026-07-17T00:00:00Z')
    });
    assert.equal(result.status, 'cloned');
    assert.equal(cloneComplete(paths.dataRoot), true);
    assert.equal(fs.existsSync(path.join(paths.dataRoot, 'Cache')), false);
    assert.equal(fs.existsSync(path.join(paths.dataRoot, 'SingletonLock')), false);
    assert.equal(fs.readFileSync(path.join(paths.dataRoot, 'hub-devices.json'), 'utf8').includes('windows-fixture'), true);
    assert.equal(fs.readFileSync(path.join(paths.dataRoot, 'session-usage-archive.json'), 'utf8').includes('version'), true);
    assert.equal(fs.readFileSync(path.join(paths.dataRoot, 'mimo-credentials', 'opaque.cookie'), 'utf8'), 'opaque-value');
    const settings = JSON.parse(fs.readFileSync(path.join(paths.dataRoot, 'settings.json'), 'utf8'));
    assert.equal(settings.language, 'zh-CN');
    assert.equal(settings.codexManagedAccounts[0].homePath, path.join(paths.dataRoot, 'managed-codex-homes', 'codex-test'));
    assert.equal(fs.statSync(path.join(paths.productionRoot, 'settings.json')).mtimeMs, sourceMtime);
  } finally {
    cleanup(root);
  }
});

test('second startup is idempotent and does not overwrite clone changes', () => {
  const { root, paths } = fixture();
  try {
    cloneDevelopmentData({ sourceRoot: paths.productionRoot, targetRoot: paths.dataRoot, isProductionRunning: () => false });
    const targetSettings = path.join(paths.dataRoot, 'settings.json');
    fs.writeFileSync(targetSettings, '{"cloneOnly":true}');
    const result = cloneDevelopmentData({ sourceRoot: paths.productionRoot, targetRoot: paths.dataRoot, isProductionRunning: () => true });
    assert.equal(result.status, 'already-complete');
    assert.equal(fs.readFileSync(targetSettings, 'utf8'), '{"cloneOnly":true}');
  } finally {
    cleanup(root);
  }
});

test('source running stops a first clone without staging or manifest', () => {
  const { root, paths } = fixture();
  try {
    const result = cloneDevelopmentData({ sourceRoot: paths.productionRoot, targetRoot: paths.dataRoot, isProductionRunning: () => true });
    assert.equal(result.status, 'source-running');
    assert.equal(fs.existsSync(`${paths.dataRoot}.importing`), false);
    assert.equal(fs.existsSync(path.join(paths.dataRoot, MANIFEST_NAME)), false);
  } finally {
    cleanup(root);
  }
});

test('staging failure leaves no manifest and refresh rollback preserves prior clone', () => {
  const { root, paths } = fixture();
  try {
    fs.mkdirSync(paths.dataRoot, { recursive: true });
    fs.writeFileSync(path.join(paths.dataRoot, 'keep.txt'), 'previous-clone');
    assert.throws(() => cloneDevelopmentData({
      sourceRoot: paths.productionRoot,
      targetRoot: paths.dataRoot,
      refresh: true,
      isProductionRunning: () => false,
      afterCopy: () => { throw new Error('fixture-copy-failure'); }
    }), /fixture-copy-failure/);
    assert.equal(fs.readFileSync(path.join(paths.dataRoot, 'keep.txt'), 'utf8'), 'previous-clone');
    assert.equal(fs.existsSync(`${paths.dataRoot}.importing`), false);
    assert.equal(fs.existsSync(path.join(paths.dataRoot, MANIFEST_NAME)), false);
  } finally {
    cleanup(root);
  }
});

test('refresh replaces a completed clone only after validation', () => {
  const { root, paths } = fixture();
  try {
    cloneDevelopmentData({ sourceRoot: paths.productionRoot, targetRoot: paths.dataRoot, isProductionRunning: () => false });
    fs.writeFileSync(path.join(paths.dataRoot, 'clone-only.txt'), 'old');
    const result = cloneDevelopmentData({
      sourceRoot: paths.productionRoot,
      targetRoot: paths.dataRoot,
      refresh: true,
      isProductionRunning: () => false
    });
    assert.equal(result.status, 'refreshed');
    assert.equal(fs.existsSync(path.join(paths.dataRoot, 'clone-only.txt')), false);
    assert.equal(cloneComplete(paths.dataRoot), true);
  } finally {
    cleanup(root);
  }
});

test('initialization sets clone paths before ready while production leaves Electron defaults unchanged', () => {
  const { root, appDataRoot, paths } = fixture('路径 含空格 中文');
  const calls = [];
  const app = {
    isPackaged: false,
    getPath(name) { assert.equal(name, 'appData'); return appDataRoot; },
    setPath(name, value) { calls.push([name, value]); }
  };
  try {
    const env = { TOKEN_MONITOR_PROFILE: 'development-clone' };
    const result = initializeStorageProfile(app, { env, isProductionRunning: () => false });
    assert.equal(result.profile, 'development-clone');
    assert.deepEqual(calls, [
      ['userData', paths.dataRoot],
      ['sessionData', paths.sessionDataRoot]
    ]);
    assert.equal(env.TOKEN_MONITOR_SHARED_DIR, paths.dataRoot);

    calls.length = 0;
    const production = initializeStorageProfile(app, { env: {} });
    assert.equal(production.profile, 'production');
    assert.deepEqual(calls, []);
  } finally {
    cleanup(root);
  }
});

test('clone allowlist is explicit and exclusion rules cover transient entries', () => {
  assert.deepEqual(CLONE_ENTRIES.includes('settings.json'), true);
  assert.deepEqual(CLONE_ENTRIES.includes('hub-devices.json'), true);
  assert.deepEqual(CLONE_ENTRIES.includes('session-usage-archive.json'), true);
  for (const name of ['Cache', 'Code Cache', 'GPUCache', 'LOCK', 'state.lock', 'SingletonSocket']) {
    assert.equal(excludedCloneEntry(name), true);
  }
});
