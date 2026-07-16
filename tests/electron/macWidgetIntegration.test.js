'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'electron', 'main.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('publishes final stats to the macOS Widget from the single sendPush outlet', () => {
  const start = mainSource.indexOf('function sendPush(payload)');
  const end = mainSource.indexOf('\nfunction statsHistoryRevision', start);
  assert.ok(start >= 0 && end > start, 'sendPush function should exist');
  const sendPush = mainSource.slice(start, end);
  assert.match(sendPush, /latestStats = payload\.data\.stats;\s+scheduleMacWidgetSnapshot\(latestStats\);/);
  assert.equal((mainSource.match(/scheduleMacWidgetSnapshot\(latestStats\)/g) || []).length, 1);
});

test('registers the Widget deep link and embeds the appex in macOS packages', () => {
  const mac = packageJson.build.mac;
  assert.deepEqual(mac.extendInfo.CFBundleURLTypes[0].CFBundleURLSchemes, ['token-monitor']);
  assert.equal(mac.extraFiles[0].to, 'PlugIns/TokenMonitorWidget.appex');
  assert.equal(mac.extraResources[0].to, 'token-monitor-widget.json');
  assert.equal(mac.sign, 'scripts/sign-macos-with-widget.js');
  assert.match(packageJson.scripts['predist:mac'], /build:mac-widget/);
});

test('macOS Widget integration leaves non-macOS packaging sections unchanged', () => {
  assert.ok(packageJson.build.win);
  assert.ok(packageJson.build.linux);
  assert.equal(packageJson.build.win.extraFiles, undefined);
  assert.equal(packageJson.build.linux.extraFiles, undefined);
});
