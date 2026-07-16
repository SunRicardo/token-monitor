'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { signApp } = require('@electron/osx-sign');

const execFileAsync = promisify(execFile);

module.exports = async function signMacAppWithWidget(options) {
  const extensionPath = path.join(
    options.app,
    'Contents',
    'PlugIns',
    'TokenMonitorWidget.appex'
  );
  const entitlementsPath = path.resolve(
    __dirname,
    '..',
    'build',
    'macos-widget',
    'TokenMonitorWidget.entitlements'
  );
  const identity = String(options.identity || '').trim();
  if (!identity) throw new Error('macOS signing identity is unavailable for Widget extension');

  const args = ['--force', '--sign', identity, '--entitlements', entitlementsPath];
  if (identity !== '-') args.push('--options', 'runtime', '--timestamp');
  if (options.keychain) args.push('--keychain', options.keychain);
  args.push(extensionPath);
  await execFileAsync('codesign', args);
  await signApp(options);
};
