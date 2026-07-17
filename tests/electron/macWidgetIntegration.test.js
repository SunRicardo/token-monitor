'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'electron', 'main.js'), 'utf8');
const widgetSource = fs.readFileSync(
  path.join(root, 'native', 'macos', 'TokenMonitorWidget', 'TokenMonitorWidget.swift'),
  'utf8'
);
const widgetIntentSource = fs.readFileSync(
  path.join(root, 'native', 'macos', 'TokenMonitorWidget', 'WidgetConfigurationIntent.swift'),
  'utf8'
);
const widgetInfo = fs.readFileSync(
  path.join(root, 'native', 'macos', 'TokenMonitorWidget', 'Info.plist'),
  'utf8'
);
const widgetProject = fs.readFileSync(
  path.join(root, 'native', 'macos', 'TokenMonitorWidget.xcodeproj', 'project.pbxproj'),
  'utf8'
);
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
  assert.equal(mac.extraResources[1].to, 'TokenMonitorWidgetReloader');
  assert.equal(mac.sign, 'scripts/sign-macos-with-widget.js');
  assert.match(packageJson.scripts['predist:mac'], /build:mac-widget/);
});

test('uses the packaged product name so a local Widget build has an independent instance lock', () => {
  assert.match(
    mainSource,
    /const APP_NAME = process\.env\.TOKEN_MONITOR_APP_NAME \|\| PACKAGED_APP_NAME \|\| app\.getName\(\) \|\| 'Token Monitor';/
  );
  assert.match(mainSource, /app\.setName\(APP_NAME\);\s+if \(process\.platform === 'win32'\)/);
});

test('supports an isolated local Widget URL scheme without changing the release default', () => {
  assert.match(mainSource, /parseMacWidgetDeepLink\(url, urlScheme\)/);
  assert.match(widgetSource, /static let urlScheme = Bundle\.main\.object/);
  assert.match(widgetInfo, /<key>TokenMonitorURLScheme<\/key>/);
  assert.deepEqual(
    packageJson.build.mac.extendInfo.CFBundleURLTypes[0].CFBundleURLSchemes,
    ['token-monitor']
  );
});

test('uses AppIntent configuration and page-specific deep links', () => {
  assert.match(widgetSource, /AppIntentConfiguration\(/);
  assert.match(widgetSource, /url\(for: entry\.page\)/);
  assert.match(widgetSource, /\.systemLarge/);
  assert.match(widgetSource, /com\.tokenmonitor\.dashboard/);
  assert.doesNotMatch(widgetSource, /StaticConfiguration\(/);
});

test('Widget period controls are real App Intent buttons without fake dropdown state', () => {
  assert.match(widgetSource, /Button\(intent: CycleWidgetPeriodIntent\(\)\)/);
  assert.match(widgetSource, /Button\(intent: SetWidgetPeriodIntent\(period: period\)\)/);
  assert.doesNotMatch(widgetSource, /onTapGesture/);
  assert.doesNotMatch(widgetSource, /chevron\.down/);
  assert.doesNotMatch(widgetSource, /TOKEN_MONITOR_WIDGET_KIND.*v4|v3-temp|dev/);
});

test('Widget page control cycles pages with per-family App Intent state', () => {
  const footerStart = widgetSource.indexOf('private func footer(page: WidgetPage, familyScope: WidgetFamilyScope?)');
  const footerEnd = widgetSource.indexOf('\n    private func statusState', footerStart);
  assert.ok(footerStart >= 0 && footerEnd > footerStart, 'footer should exist');
  const footerSource = widgetSource.slice(footerStart, footerEnd);
  const pageControlStart = widgetSource.indexOf('struct WidgetPageControl: View');
  const pageControlEnd = widgetSource.indexOf('\n}', pageControlStart);
  assert.ok(pageControlStart >= 0 && pageControlEnd > pageControlStart, 'WidgetPageControl should exist');
  const pageControlSource = widgetSource.slice(pageControlStart, pageControlEnd);
  assert.match(widgetIntentSource, /struct CycleWidgetPageIntent: AppIntent/);
  assert.match(widgetIntentSource, /static var openAppWhenRun: Bool \{ false \}/);
  assert.match(widgetIntentSource, /enum WidgetFamilyScope: String, Codable, AppEnum, CaseIterable/);
  assert.match(widgetIntentSource, /widget\.presentation\.page/);
  assert.match(widgetSource, /Button\(intent: CycleWidgetPageIntent\(family: family, currentPage: page\)\)/);
  assert.match(widgetSource, /Image\(systemName: "chevron\.right"\)/);
  assert.doesNotMatch(pageControlSource, /Link\(/, 'page control should not be wrapped in a Link');
  assert.match(footerSource, /Link\(destination: TokenMonitorWidgetConfiguration\.url\(for: page\)\)/);
  assert.doesNotMatch(widgetIntentSource, /selectedPageKey\s*=\s*"selectedPage"/);
  assert.doesNotMatch(`${widgetSource}\n${widgetIntentSource}`, /reloadAllTimelines/);
});

test('local macOS command builds the canonical Token Monitor app identity', () => {
  assert.equal(packageJson.scripts['mac:local'], 'node scripts/build-local-macos.js run');
  assert.equal(packageJson.scripts['mac:local:open'], 'open "/Applications/Token Monitor.app"');
  assert.equal(packageJson.productName, 'Token Monitor');
  assert.equal(packageJson.build.productName, 'Token Monitor');
});

test('Widget build provenance fields are injected into the extension Info.plist', () => {
  for (const key of [
    'TMWidgetGitRevision',
    'TMWidgetBuildTimestamp',
    'TMWidgetSchemaVersion',
    'TMWidgetUIVersion',
    'TMWidgetKind'
  ]) {
    assert.match(widgetInfo, new RegExp(`<key>${key}</key>`));
  }
  assert.match(widgetProject, /TOKEN_MONITOR_WIDGET_KIND = com\.tokenmonitor\.dashboard;/);
  assert.match(widgetProject, /TOKEN_MONITOR_WIDGET_GIT_REVISION = unknown;/);
  assert.match(widgetInfo, /<key>TMWidgetSchemaVersion<\/key>\s*<string>3<\/string>/);
  assert.match(widgetInfo, /<key>TMWidgetUIVersion<\/key>\s*<string>5<\/string>/);
});

test('macOS Widget integration leaves non-macOS packaging sections unchanged', () => {
  assert.ok(packageJson.build.win);
  assert.ok(packageJson.build.linux);
  assert.equal(packageJson.build.win.extraFiles, undefined);
  assert.equal(packageJson.build.linux.extraFiles, undefined);
});
