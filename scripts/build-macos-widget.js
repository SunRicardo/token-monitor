'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.join(ROOT, 'native', 'macos', 'TokenMonitorWidget.xcodeproj');
const OUTPUT = path.join(ROOT, 'build', 'macos-widget');
const DERIVED_DATA = path.join(OUTPUT, 'DerivedData');
const DEFAULT_APP_GROUP = 'group.com.example.tokenmonitor';
const DEFAULT_WIDGET_BUNDLE_ID = 'com.javis.tokenmonitor.widget';

function configuredIdentifier(name, fallback) {
  const value = String(process.env[name] || fallback).trim();
  if (!/^[A-Za-z0-9.-]+$/.test(value)) throw new Error(`${name} contains unsupported characters`);
  return value;
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function entitlementPlist(appGroup, extension = false) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${extension ? '  <key>com.apple.security.app-sandbox</key>\n  <true/>\n' : `  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
`}  <key>com.apple.security.application-groups</key>
  <array>
    <string>${xmlEscape(appGroup)}</string>
  </array>
</dict>
</plist>
`;
}

function main() {
  if (process.platform !== 'darwin') {
    console.log('[mac-widget] skipped: xcodebuild is only available on macOS');
    return;
  }

  const appGroup = configuredIdentifier('TOKEN_MONITOR_APP_GROUP', DEFAULT_APP_GROUP);
  const bundleId = configuredIdentifier('TOKEN_MONITOR_WIDGET_BUNDLE_ID', DEFAULT_WIDGET_BUNDLE_ID);
  const developmentTeam = String(process.env.DEVELOPMENT_TEAM || '').trim();
  if (developmentTeam && !/^[A-Z0-9]+$/.test(developmentTeam)) {
    throw new Error('DEVELOPMENT_TEAM contains unsupported characters');
  }

  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });

  const args = [
    '-project', PROJECT,
    '-scheme', 'TokenMonitorWidget',
    '-configuration', 'Release',
    '-derivedDataPath', DERIVED_DATA,
    'build',
    'CODE_SIGNING_ALLOWED=NO',
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=YES',
    `TOKEN_MONITOR_APP_GROUP=${appGroup}`,
    `TOKEN_MONITOR_WIDGET_BUNDLE_ID=${bundleId}`,
    `DEVELOPMENT_TEAM=${developmentTeam}`
  ];
  const result = spawnSync('xcodebuild', args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`xcodebuild exited with status ${result.status}`);

  const builtExtension = path.join(DERIVED_DATA, 'Build', 'Products', 'Release', 'TokenMonitorWidget.appex');
  const stagedExtension = path.join(OUTPUT, 'TokenMonitorWidget.appex');
  if (!fs.existsSync(builtExtension)) throw new Error(`Widget extension not found: ${builtExtension}`);
  fs.cpSync(builtExtension, stagedExtension, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'TokenMonitor.entitlements'), entitlementPlist(appGroup));
  fs.writeFileSync(path.join(OUTPUT, 'TokenMonitorWidget.entitlements'), entitlementPlist(appGroup, true));
  fs.writeFileSync(path.join(OUTPUT, 'widget-config.json'), `${JSON.stringify({
    schemaVersion: 1,
    appGroup,
    snapshotFileName: 'snapshot.json'
  }, null, 2)}\n`);
  console.log(`[mac-widget] staged ${path.relative(ROOT, stagedExtension)} (${bundleId}, ${appGroup})`);
}

main();
