'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_APP = path.join(ROOT, 'dist', 'mac-arm64', 'Token Monitor.app');
const APPLICATIONS_APP = '/Applications/Token Monitor.app';
const APPLICATIONS_DEV_APP = '/Applications/Token Monitor Widget Dev.app';
const WIDGET_NAME = 'TokenMonitorWidget.appex';
const WIDGET_PATH = path.join(APPLICATIONS_APP, 'Contents', 'PlugIns', WIDGET_NAME);
const BUSINESS_ENTRIES = [
  'settings.json',
  'hub-devices.json',
  'session-usage-archive.json',
  'collector-anchor.json',
  'deepseek-balance.json',
  'tokscale-managed-pricing.json',
  'mimo-credentials',
  'managed-codex-homes'
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : (options.stdio || 'inherit')
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.quiet) {
      process.stdout.write(sanitizeLocalOutput(result.stdout));
      process.stderr.write(sanitizeLocalOutput(result.stderr));
    }
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout || '';
}

function output(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function requireMacOS() {
  if (process.platform !== 'darwin') throw new Error('mac:local is only supported on macOS');
}

function sanitizeLocalOutput(text) {
  return String(text || '')
    .replace(/identityName=Apple Development:[^\n]+/g, 'identityName=Apple Development: [redacted]')
    .replace(/identityHash=[A-F0-9]+/g, 'identityHash=[redacted]')
    .replace(/TOKEN_MONITOR_APP_GROUP = .+/g, 'TOKEN_MONITOR_APP_GROUP = [redacted]')
    .replace(/TOKEN_MONITOR_WIDGET_BUNDLE_ID = .+/g, 'TOKEN_MONITOR_WIDGET_BUNDLE_ID = [redacted]')
    .replace(/--bundle-identifier [^ ]+/g, '--bundle-identifier [redacted]')
    .replace(/bundle-identifier [^ ]+/g, 'bundle-identifier [redacted]');
}

function buildVersion() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function appleDevelopmentIdentity() {
  if (process.env.CSC_NAME) return process.env.CSC_NAME;
  const identities = output('/usr/bin/security', ['find-identity', '-p', 'codesigning', '-v']);
  const line = identities.split('\n').find((entry) => entry.includes('"Apple Development:'));
  const match = line && line.match(/"([^"]+)"/);
  if (!match) throw new Error('No Apple Development codesigning identity found');
  return match[1];
}

function installedAppCandidates() {
  return [APPLICATIONS_DEV_APP, APPLICATIONS_APP].filter((candidate) => fs.existsSync(candidate));
}

function readPlistValue(plistPath, key) {
  try {
    return output('/usr/bin/plutil', ['-extract', key, 'raw', plistPath]).trim();
  } catch (_) {
    return '';
  }
}

function readEntitlementAppGroup(bundlePath) {
  try {
    const result = spawnSync('/usr/bin/codesign', ['-d', '--entitlements', ':-', bundlePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const text = `${result.stdout || ''}\n${result.stderr || ''}`;
    const match = text.match(/<key>com\.apple\.security\.application-groups<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
    return match ? match[1] : '';
  } catch (_) {
    return '';
  }
}

function discoverLocalSigningConfig() {
  const discovered = {
    appGroup: String(process.env.TOKEN_MONITOR_APP_GROUP || '').trim(),
    widgetBundleId: String(process.env.TOKEN_MONITOR_WIDGET_BUNDLE_ID || '').trim(),
    appBundleId: String(process.env.TOKEN_MONITOR_APP_BUNDLE_ID || '').trim()
  };
  for (const appPath of installedAppCandidates()) {
    const widgetPath = path.join(appPath, 'Contents', 'PlugIns', WIDGET_NAME);
    if (!discovered.appBundleId) {
      discovered.appBundleId = readPlistValue(path.join(appPath, 'Contents', 'Info.plist'), 'CFBundleIdentifier');
    }
    if (fs.existsSync(widgetPath)) {
      if (!discovered.widgetBundleId) {
        discovered.widgetBundleId = readPlistValue(path.join(widgetPath, 'Contents', 'Info.plist'), 'CFBundleIdentifier');
      }
      if (!discovered.appGroup) discovered.appGroup = readEntitlementAppGroup(widgetPath);
    }
    if (!discovered.appGroup) discovered.appGroup = readEntitlementAppGroup(appPath);
  }
  return discovered;
}

function requireLocalSigningEnvironment() {
  const discovered = discoverLocalSigningConfig();
  if (!discovered.appGroup) {
    throw new Error('TOKEN_MONITOR_APP_GROUP is required for mac:local');
  }
  if (!discovered.widgetBundleId) {
    throw new Error('TOKEN_MONITOR_WIDGET_BUNDLE_ID is required for mac:local');
  }
  appleDevelopmentIdentity();
  return discovered;
}

function killIfRunning(pattern) {
  const result = spawnSync('/usr/bin/pkill', ['-f', pattern], { stdio: 'ignore' });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
}

function stopApps() {
  killIfRunning('Token Monitor Widget Dev');
  killIfRunning('/Applications/Token Monitor.app');
  killIfRunning('Token Monitor.app/Contents/MacOS/Token Monitor');
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  run('/usr/bin/ditto', [source, destination]);
  return true;
}

function backupRoot() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return path.join(os.homedir(), 'TokenMonitorBackups', stamp);
}

function backupBusinessData(root) {
  const userData = path.join(os.homedir(), 'Library', 'Application Support', 'Token Monitor');
  if (!fs.existsSync(userData)) return { backedUp: false, userData };
  const dataBackup = path.join(root, 'business-data');
  fs.mkdirSync(dataBackup, { recursive: true });
  for (const entry of BUSINESS_ENTRIES) {
    copyIfExists(path.join(userData, entry), path.join(dataBackup, entry));
  }
  return { backedUp: true, userData };
}

function backupCurrentInstallations() {
  const root = backupRoot();
  fs.mkdirSync(root, { recursive: true });
  copyIfExists(APPLICATIONS_APP, path.join(root, 'Token Monitor.app'));
  copyIfExists(APPLICATIONS_DEV_APP, path.join(root, 'Token Monitor Widget Dev.app'));
  const business = backupBusinessData(root);
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    appBackedUp: fs.existsSync(path.join(root, 'Token Monitor.app')),
    devAppBackedUp: fs.existsSync(path.join(root, 'Token Monitor Widget Dev.app')),
    businessDataBackedUp: business.backedUp
  }, null, 2)}\n`, { mode: 0o600 });
  console.log('[mac-local] backup created outside the repository');
  return root;
}

function cleanBuildOutputs() {
  fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, 'build', 'macos-widget'), { recursive: true, force: true });
}

function buildApp() {
  requireMacOS();
  const localConfig = requireLocalSigningEnvironment();
  cleanBuildOutputs();
  run('npm', ['run', 'icons']);
  run('npm', ['run', 'build:mac-widget'], {
    env: {
      ...process.env,
      TOKEN_MONITOR_APP_GROUP: localConfig.appGroup,
      TOKEN_MONITOR_WIDGET_BUNDLE_ID: localConfig.widgetBundleId,
      TOKEN_MONITOR_WIDGET_URL_SCHEME: 'token-monitor',
      TOKEN_MONITOR_WIDGET_KIND: 'com.tokenmonitor.dashboard'
    }
  });

  const version = buildVersion();
  const identity = appleDevelopmentIdentity();
  const args = [
    'electron-builder',
    '--mac',
    'dir',
    '--arm64',
    '--publish',
    'never',
    `-c.buildVersion=${version}`
  ];
  const appBundleId = localConfig.appBundleId;
  if (appBundleId) args.push(`-c.appId=${appBundleId}`);
  run('npx', args, {
    env: {
      ...process.env,
      CSC_NAME: identity,
      TOKEN_MONITOR_APP_GROUP: localConfig.appGroup,
      TOKEN_MONITOR_WIDGET_BUNDLE_ID: localConfig.widgetBundleId,
      ...(appBundleId ? { TOKEN_MONITOR_APP_BUNDLE_ID: appBundleId } : {}),
      TOKEN_MONITOR_LOCAL_DEVELOPMENT_SIGNING: '1',
      TOKEN_MONITOR_PROFILE: 'production',
      TOKEN_MONITOR_WIDGET_URL_SCHEME: 'token-monitor'
    },
    quiet: true
  });
  if (!fs.existsSync(DIST_APP)) throw new Error(`Built app not found: ${DIST_APP}`);
}

function installApp() {
  requireMacOS();
  stopApps();
  const backup = backupCurrentInstallations();
  if (fs.existsSync(APPLICATIONS_DEV_APP)) fs.rmSync(APPLICATIONS_DEV_APP, { recursive: true, force: true });
  fs.rmSync(APPLICATIONS_APP, { recursive: true, force: true });
  run('/usr/bin/ditto', [DIST_APP, APPLICATIONS_APP]);
  console.log('[mac-local] installed Token Monitor.app');
  return backup;
}

function shasum(file) {
  return output('/usr/bin/shasum', ['-a', '256', file]).trim().split(/\s+/)[0];
}

function verifyInstall() {
  requireMacOS();
  if (!fs.existsSync(APPLICATIONS_APP)) throw new Error('/Applications/Token Monitor.app is missing');
  if (fs.existsSync(APPLICATIONS_DEV_APP)) throw new Error('/Applications/Token Monitor Widget Dev.app still exists');
  if (!fs.existsSync(WIDGET_PATH)) throw new Error(`Widget extension is missing: ${WIDGET_PATH}`);

  const builtBinary = path.join(DIST_APP, 'Contents', 'PlugIns', WIDGET_NAME, 'Contents', 'MacOS', 'TokenMonitorWidget');
  const installedBinary = path.join(WIDGET_PATH, 'Contents', 'MacOS', 'TokenMonitorWidget');
  const builtSha = shasum(builtBinary);
  const installedSha = shasum(installedBinary);
  if (builtSha !== installedSha) throw new Error('Installed Widget binary SHA does not match built Widget binary SHA');

  run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', WIDGET_PATH]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', APPLICATIONS_APP]);
  const plistPath = path.join(WIDGET_PATH, 'Contents', 'Info.plist');
  for (const key of ['TMWidgetGitRevision', 'TMWidgetBuildTimestamp', 'TMWidgetUIVersion', 'TMWidgetSchemaVersion', 'TMWidgetKind', 'CFBundleVersion']) {
    console.log(`[mac-local] ${key}=${readPlistValue(plistPath, key)}`);
  }
  console.log(`[mac-local] widget sha ${installedSha}`);
}

function openApp() {
  requireMacOS();
  run('/usr/bin/open', [APPLICATIONS_APP]);
}

function restartWidgetHosts() {
  killIfRunning('Dock');
  killIfRunning('NotificationCenter');
}

function main() {
  const command = process.argv[2] || 'run';
  if (command === 'build') {
    buildApp();
    return;
  }
  if (command === 'install') {
    installApp();
    verifyInstall();
    return;
  }
  if (command === 'verify') {
    verifyInstall();
    return;
  }
  if (command === 'open') {
    openApp();
    return;
  }
  if (command !== 'run') throw new Error(`Unsupported command: ${command}`);
  buildApp();
  installApp();
  verifyInstall();
  restartWidgetHosts();
  openApp();
}

main();
