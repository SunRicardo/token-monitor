# macOS Widget 开发指南

## 范围

原生 Widget 位于 `native/macos/`，支持 `systemSmall`、`systemMedium` 和 `systemLarge`。每个实例通过 `AppIntentConfiguration` 独立选择主页、额度、模型、活动或趋势，并通过对应页面深链接打开主应用。

Widget 不读取 collector、settings 或 provider 凭据。Electron 仅从最终聚合 stats 生成 allowlist 快照并写入 App Group 容器的 `snapshot.json`。

## 本地配置

仓库默认值仅用于无签名构建和结构验证：

```text
TOKEN_MONITOR_APP_GROUP=group.com.example.tokenmonitor
TOKEN_MONITOR_WIDGET_BUNDLE_ID=com.javis.tokenmonitor.widget
TOKEN_MONITOR_WIDGET_URL_SCHEME=token-monitor
```

要在系统 Widget 列表中使用，需要在个人 Apple Developer 配置中创建真实 App Group，并为主应用和 extension 配置对应 capability/provisioning。通过环境变量注入：

```bash
export TOKEN_MONITOR_APP_GROUP='group.com.example.tokenmonitor'
export TOKEN_MONITOR_WIDGET_BUNDLE_ID='com.example.tokenmonitor.widget'
export TOKEN_MONITOR_WIDGET_URL_SCHEME='token-monitor'
export DEVELOPMENT_TEAM='YOUR_TEAM_ID'
```

当前本地验收使用单一应用身份。仓库根目录执行：

```bash
npm run mac:local
```

该命令会清理构建产物、构建最新 Widget extension、构建 Electron app、签名、安装到 `/Applications/Token Monitor.app`、验证安装版 Widget 与构建产物一致，并启动应用。产品名称保持 `Token Monitor`，URL scheme 保持 `token-monitor://`，默认 storage profile 为 `production`，即继续读取原 Token Monitor 的规范 `userData`。

`TOKEN_MONITOR_LOCAL_DEVELOPMENT_SIGNING=1` 只用于本机 Apple Development 签名路径。它关闭 timestamp 与 hardened runtime，保留正式 Developer ID 路径的默认行为；本地 Bundle ID、Widget Bundle ID 和 App Group 仍通过环境变量注入，但业务数据路径不从 Bundle ID 推导。

`development-clone` 和 `clean` 仍保留给自动化测试、空状态测试和隔离调试，但不是当前根目录运行命令的默认值。需要显式隔离调试时才设置：

```bash
export TOKEN_MONITOR_PROFILE='development-clone'
```

`production` 保持既有正式目录不变；`development-clone` 首次启动时在正式版退出后，通过 staging 和原子替换复制业务白名单；`clean` 使用独立空目录。隔离调试不能直接指向正式版 `userData`。

克隆白名单包括设置、嵌入式 Hub 设备历史、session usage archive、collector anchor 和必要的 managed provider 凭据。Chromium Cache、Session Storage、Singleton/lock、Crashpad 和日志不复制。完成标记为 `development-clone-manifest.json`，不记录源绝对路径、用户标识或凭据内容。

不要提交真实 Team ID、证书、Provisioning Profile、私钥、个人 App Group 或个人 Bundle ID。

## 数据链路

1. local/client/host 模式都从 `src/electron/main.js` 的 `sendPush()` 进入统一出口。
2. `src/shared/macWidgetSnapshot.js` 生成 schema version 2 的显式白名单快照。
3. `src/electron/macWidgetBridge.js` 在 macOS 上执行同目录临时写入、`fsync` 和原子 rename。
4. 内容变化且写入成功后，Electron 调用打包进 app 的 `TokenMonitorWidgetReloader`，通过公开 `WidgetCenter.reloadTimelines(ofKind:)` 请求刷新。
5. WidgetKit 通过 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)` 读取快照。

快照只包含 overview、quota、models、activity、trend、非敏感 presentation 和 status。账号 key、邮箱、姓名、Cookie、API key/token、prompt、conversation/session 内容、Hub 凭据和本地路径不会写入。Swift 端继续兼容 schema v1，并对 v2 缺失字段使用 fallback。

页面配置以每个 Widget 实例的 `TokenMonitorWidgetConfigurationIntent.page` 为唯一真源。左下角控件只提示可编辑配置，并通过深链接打开主应用；公开 WidgetKit API 不提供在 Widget 内直接改写当前实例配置的通用入口，因此没有实现会影响所有实例的全局伪切换。

Widget Kind 固定为 `com.tokenmonitor.dashboard`。Small、Medium 和 Large 共用同一个 Kind，页面差异只由 App Intent 配置决定。旧桌面实例如果仍显示旧 UI，需要删除旧 Widget 后重新添加。

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

构建并安装本机 canonical 应用：

```bash
npm run mac:local
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
- Electron 快照写入会合并积压更新；内容未变化时不触发 reload helper；写入失败只记录日志，不阻塞 collector、renderer、tray 或 hub。
- 主应用退出后保留最后一个完整快照。
- 快照缺失、JSON 解码失败或超过 20 分钟时，Widget 显示明确的等待/过期状态。

## 尚未覆盖

- 正式 Developer ID 签名与 provisioning；
- GitHub Actions 中的 App Group/extension 签名配置；
- notarization 与 stapling 的真实凭据验证；
- 系统 Widget 列表和桌面的人工验收。
