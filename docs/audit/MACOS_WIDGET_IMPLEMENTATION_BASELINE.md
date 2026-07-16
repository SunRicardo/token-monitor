# macOS Widget 实施基线审计

> 审计基线：`upstream/main@9946b13`（package version `0.29.0`），2026-07-16。

## 当前数据入口

- `src/shared/collector.js` 的 `collectUsageOnce()` 生成单设备记录；本地 collector、同步 collector 和 host collector 都复用这条采集链路。
- `src/shared/usage.js` 的 `aggregateDevices()` 将设备记录聚合为 renderer 使用的 stats。其核心结构为 `periods.today/month/allTime`、`devices` 和 `limits`。
- `limits` 由 `src/shared/limits.js` 的 `aggregateLimits()` 汇总，结构为 `{ updatedAt, providers }`。每个 provider 可包含 `provider`、`status`、`updatedAt`、`windows`、`balance`、`source`、`sourceDetail`、账号标识和设备来源等字段。
- local 模式在 `startLocalCollector()` 的 `onUpdate` / `onPreview` 中聚合；client 模式将 SSE stats 与本机设备记录合成；host 模式读取 embedded hub 聚合结果。
- 三种模式以及手动刷新最终都通过 `sendPush(payload)` 更新 `latestStats` 并推送 renderer。`sendPush()` 因而是模式无关的单一出口。

## 推荐接入点

在 `sendPush()` 已确认 `payload.data.stats` 后异步调度 Widget 快照更新。接入必须位于 `injectLocalDeviceStatus()` 之后，确保读取与 renderer 相同的最终 stats；写入失败只记录受控日志，不得阻塞 tray、renderer、collector、SSE 或 exporter。

Snapshot serializer 放在 `src/shared/`，保持纯 JavaScript；路径解析、原子写入和 macOS 平台判断放在 `src/electron/macWidgetBridge.js`。这避免在 local/client/host collector 分支重复实现，也不改变 hub/Worker wire shape。

## 快照隐私边界

Widget 快照只保留：生成时间、今日总 Token、今日费用、按工具汇总的 Token/费用，以及少量可显示的额度窗口。禁止复制整个 stats、device record 或 provider 对象。

必须丢弃账号 key、邮箱、姓名、label、Cookie、API token/key、prompt、conversation/session 内容、本地凭据路径和任意未知扩展字段。额度仅输出 provider id、状态及归一化窗口数值；对字符串采用 allowlist，而不是依靠敏感字段 denylist。

## WidgetKit 刷新限制

WidgetKit 的 timeline 刷新由系统调度，不能承诺秒级刷新。主应用写入新快照后可请求 `WidgetCenter.reloadTimelines(ofKind:)`，但系统可能合并或延迟请求。第一版 timeline 应读取最后一个完整快照，并为缺失、过期和解码失败提供稳定占位；主应用退出后继续显示最近快照。

## App Group 需求

主应用和 Widget extension 需要相同的 App Group entitlement，Widget 通过 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)` 定位共享容器。仓库不提交个人 Team ID、证书、Provisioning Profile、个人 Bundle ID 或个人 App Group；构建通过 `TOKEN_MONITOR_APP_GROUP`、`TOKEN_MONITOR_WIDGET_BUNDLE_ID` 和 `DEVELOPMENT_TEAM` 注入。本地未配置 App Group 时，bridge 应安全跳过并记录原因。

## `.appex` 打包风险

- 当前仓库没有 `native/`、Xcode project、Swift 源码或 `.appex` 嵌入流程。
- `electron-builder` 的 `files` 只覆盖 Electron/Shared/Hub 与图标；Widget 必须先由 `xcodebuild` 产出，再放入 `Token Monitor.app/Contents/PlugIns/TokenMonitorWidget.appex`。
- extension 的最低 macOS 版本、架构、Bundle ID、主应用标识和 App Group 必须与 Electron 包配置一致。
- 仅复制目录不足以证明可用；必须检查 extension `Info.plist`、Mach-O 架构、嵌入路径和签名链。

## electron-builder 签名风险

- `package.json` 当前设置 `mac.forceCodeSigning: true`，发布流程使用 Developer ID 凭据和 App Store Connect API key 做签名、公证。
- 当前没有主应用或 extension entitlements；加入 App Group 后两者必须分别签名且 entitlement 完全一致。
- extension 需要在主应用签名前进入 bundle。若先签主应用再复制 `.appex`，`codesign --verify --deep --strict` 会失败。
- 本机 Xcode 为 26.6，但没有有效 codesigning identity；可执行 Swift 编译和无签名 bundle 结构验证，不能据此声称 Developer ID 签名、公证或实机 Widget 注册通过。
- 本轮不修改 `.github/workflows/release.yml` 或 Fork release workflow。正式 CI 签名集成在本地 PoC 验证后单独设计。

## 当前测试与构建基线

- JavaScript 使用 Node `node:test`，测试按 `tests/**/*.test.js` 命名。
- `npm run verify` 是 lint + 全量测试入口，要求 Node 22.13+；本机为 Node 22.23.1 / npm 10.9.8。
- macOS 包由 `npm run dist:mac` 调用 electron-builder，当前目标为 arm64 的 DMG + ZIP。
- release CI 在 macOS 15 runner 上执行 `codesign`、`spctl`、stapler 与 notarytool 验证。

## 分阶段实施计划

1. 建立版本化、allowlist 驱动的纯 JS Snapshot serializer 及隐私测试。
2. 建立 macOS-only 原子写入 bridge，路径和文件系统依赖可注入，失败与主数据链路隔离。
3. 新增最小 WidgetKit extension，覆盖 small/medium、空数据、过期状态和打开主应用。
4. 增加可替换 App Group / Bundle ID 构建配置，并在 `sendPush()` 单点接入异步写入。
5. 完成 JS 验证、Swift JSON 解码测试、Xcode build、`.app/Contents/PlugIns/*.appex` 结构检查。
6. 个人签名配置可用后，再验证共享容器、Widget 列表、主应用退出后的快照保留和完整 codesign；最后另行设计 CI、公证接入。
