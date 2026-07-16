# macOS Widget 开发指南

## 范围

原生 Widget 位于 `native/macos/`，支持 `systemSmall` 和 `systemMedium`，展示今日 Token、费用、工具摘要、最多两个额度窗口、更新时间，以及空数据/过期状态。点击 Widget 通过 `token-monitor://widget` 打开主应用。

Widget 不读取 collector、settings 或 provider 凭据。Electron 仅从最终聚合 stats 生成 allowlist 快照并写入 App Group 容器的 `snapshot.json`。

## 本地配置

仓库默认值仅用于无签名构建和结构验证：

```text
TOKEN_MONITOR_APP_GROUP=group.com.example.tokenmonitor
TOKEN_MONITOR_WIDGET_BUNDLE_ID=com.javis.tokenmonitor.widget
```

要在系统 Widget 列表中使用，需要在个人 Apple Developer 配置中创建真实 App Group，并为主应用和 extension 配置对应 capability/provisioning。通过环境变量注入：

```bash
export TOKEN_MONITOR_APP_GROUP='group.com.example.tokenmonitor'
export TOKEN_MONITOR_WIDGET_BUNDLE_ID='com.example.tokenmonitor.widget'
export DEVELOPMENT_TEAM='YOUR_TEAM_ID'
```

不要提交真实 Team ID、证书、Provisioning Profile、私钥、个人 App Group 或个人 Bundle ID。

## 数据链路

1. local/client/host 模式都从 `src/electron/main.js` 的 `sendPush()` 进入统一出口。
2. `src/shared/macWidgetSnapshot.js` 生成 schema version 1 的最小快照。
3. `src/electron/macWidgetBridge.js` 在 macOS 上执行同目录临时写入、`fsync` 和原子 rename。
4. WidgetKit 通过 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)` 读取快照。

快照只包含总量、已知工具 ID、provider ID、状态和额度窗口数值/时间。账号 key、邮箱、姓名、Cookie、API key/token、prompt、conversation/session 内容和本地凭据路径不会写入。

## 构建与测试

编译 extension：

```bash
npm run build:mac-widget
```

运行 Swift JSON 解码测试：

```bash
xcodebuild -project native/macos/TokenMonitorWidget.xcodeproj \
  -scheme TokenMonitorWidget \
  -destination 'platform=macOS' \
  -derivedDataPath /tmp/token-monitor-widget-derived \
  test CODE_SIGNING_ALLOWED=NO
```

执行完整项目验证：

```bash
npm run verify
```

无个人证书时，可生成 ad-hoc 签名的目录包做嵌入和签名结构验证：

```bash
npm run icons
npm run build:mac-widget
npx electron-builder --mac dir --arm64 --publish never \
  -c.mac.identity=- \
  -c.mac.forceCodeSigning=false \
  -c.mac.hardenedRuntime=false
```

验证产物：

```bash
find dist -path '*Contents/PlugIns/*.appex' -print
codesign -d --entitlements :- 'dist/mac-arm64/Token Monitor.app'
codesign -d --entitlements :- 'dist/mac-arm64/Token Monitor.app/Contents/PlugIns/TokenMonitorWidget.appex'
codesign --verify --deep --strict --verbose=2 'dist/mac-arm64/Token Monitor.app'
```

`scripts/sign-macos-with-widget.js` 必须先签 extension，再调用 Electron 原有签名流程签主应用。electron-builder 26 默认忽略 `Contents/PlugIns`，删除这个定制入口会留下未签名 `.appex`。

## 刷新与故障语义

- WidgetKit 的 15 分钟 timeline policy 是系统调度请求，不保证实时或秒级刷新。
- Electron 快照写入会合并积压更新；失败只记录日志，不阻塞 collector、renderer、tray 或 hub。
- 主应用退出后保留最后一个完整快照。
- 快照缺失、JSON 解码失败或超过 20 分钟时，Widget 显示明确的等待/过期状态。

## 尚未覆盖

- 正式 Developer ID 签名与 provisioning；
- GitHub Actions 中的 App Group/extension 签名配置；
- notarization 与 stapling 的真实凭据验证；
- 系统 Widget 列表和桌面的人工验收；
- 主应用写入后主动调用 `WidgetCenter.reloadTimelines`。
