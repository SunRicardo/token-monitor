# Native macOS Widget

This directory contains the WidgetKit extension embedded by the Electron macOS build.

## Configuration

The committed defaults are non-personal placeholders. Set these environment variables for a real development or distribution identity:

- `TOKEN_MONITOR_APP_GROUP` — shared App Group used by the Electron app and extension.
- `TOKEN_MONITOR_WIDGET_BUNDLE_ID` — extension bundle identifier.
- `DEVELOPMENT_TEAM` — Apple Developer Team ID used by Xcode when signing is enabled.
- `TOKEN_MONITOR_WIDGET_URL_SCHEME` — page-specific Widget deep-link scheme.
- `TOKEN_MONITOR_PROFILE` — `production`, `development-clone`, or `clean`; local Widget builds normally use `development-clone`.

Do not commit personal values, certificates, provisioning profiles, or private keys. A usable App Group must exist in the selected Apple Developer account and be enabled by both provisioning profiles.

## Build and test

```bash
npm run build:mac-widget
xcodebuild -project native/macos/TokenMonitorWidget.xcodeproj -scheme TokenMonitorWidget -destination 'platform=macOS' test CODE_SIGNING_ALLOWED=NO
```

`npm run dist:mac` runs the Widget build first and embeds `TokenMonitorWidget.appex` under `Contents/PlugIns`. The release signer must sign the extension with `TokenMonitorWidget.entitlements` before signing the containing Electron app.

WidgetKit schedules timeline refreshes; the 15-minute policy is a request, not a real-time guarantee. The extension keeps displaying the last valid snapshot while the main app is closed and shows explicit missing/stale states.

The extension uses `AppIntentConfiguration`, so each Small or Medium instance owns its own Overview, Quota, Models, Activity, or Trend selection. Snapshot schema v2 is allowlisted and the decoder retains schema v1 compatibility.
