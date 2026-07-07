# 项目概览

> 当前基线：`upstream/main`（`9946b13`，package version `0.29.0`），2026-07-16 更新。

## 项目定位

Token Monitor 是一个本地优先的 Electron 桌面监测工具，用来收集和展示 AI 工具的 token usage、cost、session、history 和 limit 状态，并在需要时通过 hub 做多设备汇总。

从代码结构看，它不是一个单纯的桌面壳，而是四类能力的组合：

- 桌面 Widget / Settings UI。
- 本机 collector。
- 可选的 Node hub / Cloudflare Worker hub。
- 可选的 headless agent。

相关入口主要在：

- `src/electron/main.js`
- `src/electron/renderer/app.js`
- `src/shared/collector.js`
- `src/shared/limitCollector.js`
- `src/shared/usage.js`
- `src/hub/server.js`
- `src/agent/agent.js`
- `worker/src/index.js`

## 核心能力

1. 本地收集 token usage 和 session 细节，来源包括 tokscale、WSL 数据、局部 session 文件和各类本地 DB。
2. 读取 AI Tool Limits 状态，按 provider 汇总 session / weekly / billing 等窗口。当前支持 17 个 limit provider（含 v0.25.0 新增的 MiMo 多账号和 Ollama Cloud）。
3. 本地展示今日、月度、全量、趋势和 session 级别视图。
4. 通过 hub 合并多台设备的数据（v0.25.0 增加了 payload 大小限制和 413 响应）。
5. 提供导出能力，方便接到 Obsidian、Excel、Grafana 或自定义脚本。

## 运行形态

当前代码明确支持三种 widget 模式，来自 `src/electron/main.js` 的 `hubMode`：

- `local`：只做本地收集和本地 UI 展示。
- `client`：连接远端 hub，同时把本机数据同步到 hub。
- `host`：在本机嵌入 hub，对外接收其他设备上报。

另外还有两个非 UI 入口：

- `src/agent/agent.js`：headless collector，适合无界面的机器或定时任务。
- `worker/src/index.js`：Cloudflare Worker 版本的 hub，协议与 Node hub 保持一致。

## 适合二次开发的方向

按当前代码形态，最适合做定制的方向是 UI 组合层和 provider 扩展层，而不是先改协议：

- 调整首页布局，把 local monitoring 和 cloud monitoring 拆成更清晰的双面板。
- 在 renderer 层增加可折叠区块，减少主界面密度。
- 为限额账号异常增加就地刷新、重新登录入口。
- 继续补充新的 limit provider，而不改变 `collectUsageOnce()` / hub ingest 的 wire shape。
- 通过小范围、独立的 renderer 组件改动保持 upstream 可合并性。

## 不建议优先动的部分

以下部分更像稳定底座，应该尽量保持兼容：

- `src/shared/collector.js` 的采集协议。
- `src/shared/usage.js` 的设备记录结构。
- `docs/API.md` 描述的 hub API。
- `worker/src/shared/` 下由 `npm run sync:worker` 生成的 vendored 副本。

如果要改这些层，应该先确认是否会影响多设备同步、历史聚合和公开统计的兼容性。
