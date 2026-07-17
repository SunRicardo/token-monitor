'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  appSignOptions,
  extensionSignArgs,
  localCodesignWrapperScript,
  localMainAppSignArgs,
  localStorageProfile,
  localWidgetURLScheme
} = require('../../scripts/sign-macos-with-widget');

test('keeps release timestamp and hardened runtime signing defaults', () => {
  const options = { identity: 'Developer ID Application: Example', hardenedRuntime: true };

  assert.strictEqual(appSignOptions(options, false), options);
  assert.deepEqual(extensionSignArgs({
    identity: options.identity,
    entitlementsPath: '/tmp/widget.entitlements',
    keychain: '/tmp/test.keychain',
    localDevelopmentSigning: false
  }), [
    '--force', '--sign', options.identity,
    '--entitlements', '/tmp/widget.entitlements',
    '--options', 'runtime', '--timestamp',
    '--keychain', '/tmp/test.keychain'
  ]);
});

test('disables timestamp and hardened runtime only for local development signing', async () => {
  const options = {
    identity: 'Apple Development: Example',
    hardenedRuntime: true,
    optionsForFile: async () => ({ entitlements: '/tmp/inherit.entitlements' })
  };

  const localOptions = appSignOptions(options, true);
  assert.equal(localOptions.identity, options.identity);
  assert.equal(localOptions.hardenedRuntime, false);
  assert.equal(localOptions.timestamp, 'none');
  assert.deepEqual(await localOptions.optionsForFile('/tmp/example'), {
    entitlements: '/tmp/inherit.entitlements',
    hardenedRuntime: false,
    timestamp: 'none'
  });
  assert.deepEqual(extensionSignArgs({
    identity: options.identity,
    entitlementsPath: '/tmp/widget.entitlements',
    localDevelopmentSigning: true
  }), [
    '--force', '--sign', options.identity,
    '--entitlements', '/tmp/widget.entitlements'
  ]);
  assert.equal(options.hardenedRuntime, true);
  assert.equal(options.timestamp, undefined);
});

test('local codesign wrapper removes timestamp arguments without changing release signing', () => {
  const wrapper = localCodesignWrapperScript();

  assert.match(wrapper, /--timestamp\|--timestamp=\*/);
  assert.match(wrapper, /exec \/usr\/bin\/codesign/);
});

test('local main app re-sign keeps its entitlement without release-only flags', () => {
  assert.deepEqual(localMainAppSignArgs({
    identity: 'Apple Development: Example',
    entitlements: '/tmp/main.entitlements',
    keychain: '/tmp/test.keychain',
    app: '/tmp/Token Monitor Widget Dev.app'
  }), [
    '--force', '--sign', 'Apple Development: Example',
    '--entitlements', '/tmp/main.entitlements',
    '--keychain', '/tmp/test.keychain',
    '/tmp/Token Monitor Widget Dev.app'
  ]);
});

test('accepts only a safe local Widget URL scheme', () => {
  const previous = process.env.TOKEN_MONITOR_WIDGET_URL_SCHEME;
  try {
    process.env.TOKEN_MONITOR_WIDGET_URL_SCHEME = 'token-monitor-widget-dev';
    assert.equal(localWidgetURLScheme(), 'token-monitor-widget-dev');
    process.env.TOKEN_MONITOR_WIDGET_URL_SCHEME = 'bad scheme';
    assert.throws(() => localWidgetURLScheme(), /unsupported characters/);
  } finally {
    if (previous === undefined) delete process.env.TOKEN_MONITOR_WIDGET_URL_SCHEME;
    else process.env.TOKEN_MONITOR_WIDGET_URL_SCHEME = previous;
  }
});

test('embeds only a recognized storage profile for local packages', () => {
  const previous = process.env.TOKEN_MONITOR_PROFILE;
  try {
    process.env.TOKEN_MONITOR_PROFILE = 'development-clone';
    assert.equal(localStorageProfile(), 'development-clone');
    process.env.TOKEN_MONITOR_PROFILE = 'clean';
    assert.equal(localStorageProfile(), 'clean');
    process.env.TOKEN_MONITOR_PROFILE = 'production';
    assert.equal(localStorageProfile(), 'production');
    process.env.TOKEN_MONITOR_PROFILE = 'shared-production-data';
    assert.throws(() => localStorageProfile(), /unsupported profile/);
  } finally {
    if (previous === undefined) delete process.env.TOKEN_MONITOR_PROFILE;
    else process.env.TOKEN_MONITOR_PROFILE = previous;
  }
});
