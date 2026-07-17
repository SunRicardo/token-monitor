'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const STORAGE_PROFILES = new Set(['production', 'development-clone', 'clean']);
const PRODUCTION_DIRECTORY_NAME = 'Token Monitor';
const DEVELOPMENT_DIRECTORY_NAME = 'Token Monitor Widget Dev';
const CLEAN_DIRECTORY_NAME = 'Token Monitor Clean';
const MANIFEST_NAME = 'development-clone-manifest.json';
const STORAGE_CONFIG_NAME = 'token-monitor-storage.json';

const CLONE_ENTRIES = Object.freeze([
  'settings.json',
  'hub-devices.json',
  'session-usage-archive.json',
  'collector-anchor.json',
  'deepseek-balance.json',
  'tokscale-managed-pricing.json',
  'mimo-credentials',
  'managed-codex-homes'
]);

const EXCLUDED_NAMES = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache',
  'DawnWebGPUCache', 'ShaderCache', 'Crashpad', 'logs', 'temp', 'tmp',
  'LOCK', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'
]);

function resolveStorageProfile(options = {}) {
  const env = options.env || process.env;
  const configured = String(env.TOKEN_MONITOR_PROFILE || options.configProfile || 'production').trim();
  if (!STORAGE_PROFILES.has(configured)) {
    throw new Error(`Unsupported TOKEN_MONITOR_PROFILE: ${configured}`);
  }
  return configured;
}

function profileRoots(appDataRoot) {
  return {
    production: path.join(appDataRoot, PRODUCTION_DIRECTORY_NAME),
    'development-clone': path.join(appDataRoot, DEVELOPMENT_DIRECTORY_NAME),
    clean: path.join(appDataRoot, CLEAN_DIRECTORY_NAME)
  };
}

function storagePaths({ appDataRoot, profile }) {
  const roots = profileRoots(appDataRoot);
  const dataRoot = roots[profile];
  if (!dataRoot) throw new Error(`Unsupported storage profile: ${profile}`);
  return {
    profile,
    productionRoot: roots.production,
    dataRoot,
    sessionDataRoot: profile === 'production' ? roots.production : path.join(dataRoot, 'Chromium'),
    settingsPath: path.join(dataRoot, 'settings.json'),
    historyPath: path.join(dataRoot, 'session-usage-archive.json'),
    hubDataPath: path.join(dataRoot, 'hub-devices.json'),
    importedDataPath: path.join(dataRoot, 'hub-devices.json'),
    collectorAnchorPath: path.join(dataRoot, 'collector-anchor.json'),
    providerCredentialsRoot: path.join(dataRoot, 'mimo-credentials'),
    managedCodexRoot: path.join(dataRoot, 'managed-codex-homes'),
    manifestPath: path.join(dataRoot, MANIFEST_NAME)
  };
}

function readPackagedProfile(resourcesPath, fsApi = fs) {
  if (!resourcesPath) return '';
  try {
    const parsed = JSON.parse(fsApi.readFileSync(path.join(resourcesPath, STORAGE_CONFIG_NAME), 'utf8'));
    return String(parsed?.profile || '').trim();
  } catch (_) {
    return '';
  }
}

function cloneComplete(targetRoot, fsApi = fs) {
  try {
    const manifest = JSON.parse(fsApi.readFileSync(path.join(targetRoot, MANIFEST_NAME), 'utf8'));
    return manifest?.schemaVersion === 1
      && manifest?.profile === 'development-clone'
      && manifest?.sourceKind === 'production'
      && manifest?.copyCompleted === true;
  } catch (_) {
    return false;
  }
}

function excludedCloneEntry(name) {
  return EXCLUDED_NAMES.has(name)
    || name.endsWith('.lock')
    || name.startsWith('Singleton');
}

function copyEntry(source, destination, fsApi = fs) {
  const stat = fsApi.lstatSync(source);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fsApi.mkdirSync(destination, { recursive: true, mode: stat.mode });
    for (const child of fsApi.readdirSync(source)) {
      if (excludedCloneEntry(child)) continue;
      copyEntry(path.join(source, child), path.join(destination, child), fsApi);
    }
    return;
  }
  if (!stat.isFile()) return;
  fsApi.mkdirSync(path.dirname(destination), { recursive: true });
  fsApi.copyFileSync(source, destination);
  try { fsApi.chmodSync(destination, stat.mode); } catch (_) {}
}

function rewriteManagedCodexPaths(settingsPath, finalTargetRoot, fsApi = fs) {
  let settings;
  try {
    settings = JSON.parse(fsApi.readFileSync(settingsPath, 'utf8'));
  } catch (_) {
    return;
  }
  if (!Array.isArray(settings.codexManagedAccounts)) return;
  const managedRoot = path.join(finalTargetRoot, 'managed-codex-homes');
  let changed = false;
  settings.codexManagedAccounts = settings.codexManagedAccounts.map((account) => {
    if (!account || typeof account !== 'object') return account;
    const id = String(account.id || '').trim();
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return account;
    const homePath = path.join(managedRoot, id);
    changed = true;
    return { ...account, homePath, authPath: path.join(homePath, 'auth.json') };
  });
  if (changed) fsApi.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function productionAppRunning(options = {}) {
  if (typeof options.isProductionRunning === 'function') return Boolean(options.isProductionRunning());
  if ((options.platform || process.platform) !== 'darwin') return false;
  const result = spawnSync('/usr/bin/pgrep', ['-x', PRODUCTION_DIRECTORY_NAME], {
    encoding: 'utf8',
    stdio: 'ignore'
  });
  return result.status === 0;
}

function developmentCloneManifest(now = new Date()) {
  return {
    schemaVersion: 1,
    profile: 'development-clone',
    sourceKind: 'production',
    copiedAt: now.toISOString(),
    copyCompleted: true,
    sourceStorageVersion: 1
  };
}

function cloneDevelopmentData(options) {
  const fsApi = options.fs || fs;
  const sourceRoot = options.sourceRoot;
  const targetRoot = options.targetRoot;
  const refresh = Boolean(options.refresh);
  if (!sourceRoot || !targetRoot || path.resolve(sourceRoot) === path.resolve(targetRoot)) {
    throw new Error('Development clone requires distinct source and target roots');
  }
  if (!refresh && cloneComplete(targetRoot, fsApi)) return { status: 'already-complete' };
  if (!fsApi.existsSync(sourceRoot)) return { status: 'source-missing' };
  if (productionAppRunning(options)) return { status: 'source-running' };

  const stagingRoot = `${targetRoot}.importing`;
  const backupRoot = `${targetRoot}.backup-${process.pid}`;
  let backedUp = false;
  try {
    fsApi.rmSync(stagingRoot, { recursive: true, force: true });
    fsApi.rmSync(backupRoot, { recursive: true, force: true });
    fsApi.mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    for (const entry of CLONE_ENTRIES) {
      const source = path.join(sourceRoot, entry);
      if (!fsApi.existsSync(source) || excludedCloneEntry(entry)) continue;
      copyEntry(source, path.join(stagingRoot, entry), fsApi);
    }
    rewriteManagedCodexPaths(path.join(stagingRoot, 'settings.json'), targetRoot, fsApi);
    if (typeof options.afterCopy === 'function') options.afterCopy(stagingRoot);
    fsApi.writeFileSync(
      path.join(stagingRoot, MANIFEST_NAME),
      `${JSON.stringify(developmentCloneManifest(options.now || new Date()), null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    if (fsApi.existsSync(path.join(sourceRoot, 'settings.json'))
      && !fsApi.existsSync(path.join(stagingRoot, 'settings.json'))) {
      throw new Error('Development clone validation failed');
    }
    if (fsApi.existsSync(targetRoot)) {
      fsApi.renameSync(targetRoot, backupRoot);
      backedUp = true;
    }
    fsApi.renameSync(stagingRoot, targetRoot);
    if (backedUp) {
      try { fsApi.rmSync(backupRoot, { recursive: true, force: true }); } catch (_) {}
    }
    return { status: refresh ? 'refreshed' : 'cloned' };
  } catch (error) {
    try { fsApi.rmSync(stagingRoot, { recursive: true, force: true }); } catch (_) {}
    if (backedUp && !fsApi.existsSync(targetRoot)) {
      try { fsApi.renameSync(backupRoot, targetRoot); } catch (_) {}
    }
    throw error;
  }
}

function initializeStorageProfile(app, options = {}) {
  const env = options.env || process.env;
  const appDataRoot = options.appDataRoot || app.getPath('appData');
  const packagedProfile = app.isPackaged
    ? readPackagedProfile(options.resourcesPath || process.resourcesPath, options.fs || fs)
    : '';
  const profile = resolveStorageProfile({ env, configProfile: packagedProfile });
  const paths = storagePaths({ appDataRoot, profile });
  let cloneStatus = 'not-required';

  if (profile === 'development-clone') {
    const refresh = env.TOKEN_MONITOR_REFRESH_DEVELOPMENT_CLONE === '1';
    const result = cloneDevelopmentData({
      sourceRoot: paths.productionRoot,
      targetRoot: paths.dataRoot,
      refresh,
      platform: options.platform,
      isProductionRunning: options.isProductionRunning,
      fs: options.fs
    });
    cloneStatus = result.status;
    if (cloneStatus === 'source-running') {
      throw new Error('Close Token Monitor before creating or refreshing the development data clone.');
    }
  } else {
    (options.fs || fs).mkdirSync(paths.dataRoot, { recursive: true });
  }

  (options.fs || fs).mkdirSync(paths.dataRoot, { recursive: true });
  if (profile !== 'production') {
    (options.fs || fs).mkdirSync(paths.sessionDataRoot, { recursive: true });
    app.setPath('userData', paths.dataRoot);
    app.setPath('sessionData', paths.sessionDataRoot);
    env.TOKEN_MONITOR_SHARED_DIR = paths.dataRoot;
  }
  return { profile, paths, cloneStatus };
}

module.exports = {
  CLEAN_DIRECTORY_NAME,
  CLONE_ENTRIES,
  DEVELOPMENT_DIRECTORY_NAME,
  MANIFEST_NAME,
  PRODUCTION_DIRECTORY_NAME,
  STORAGE_CONFIG_NAME,
  cloneComplete,
  cloneDevelopmentData,
  developmentCloneManifest,
  excludedCloneEntry,
  initializeStorageProfile,
  profileRoots,
  readPackagedProfile,
  resolveStorageProfile,
  rewriteManagedCodexPaths,
  storagePaths
};
