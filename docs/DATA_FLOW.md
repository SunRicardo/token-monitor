# 数据流

## 概览

当前代码里，最关键的源头函数是 `collectUsageOnce()`。它把本地 usage、WSL usage、session 细节、历史和 limits 合并成一个设备记录，再由 hub / renderer / worker 按不同场景消费。

相关实现主要在：

- `src/shared/collector.js`
- `src/shared/usage.js`
- `src/shared/limitCollector.js`
- `src/shared/limits.js`
- `src/shared/history.js`
- `src/hub/server.js`
- `src/agent/agent.js`
- `worker/src/index.js`

## Usage 流

1. `collector.js` 调用 tokscale，读取本机 client 数据。
2. 在 full tick 时，collector 会分别取 `today`、`month`、`allTime`。
3. 在 watch / live 场景下，它只重扫 `today`，再用 `applyPeriodDelta()` 还原 `month` 和 `allTime`。
4. Windows 场景下，collector 还会在 full tick 上从 running WSL distro 里补充 usage。
5. 收集结果进入 `usage.js` 做归一化，形成统一的 device record。

### 相关数据

- `today` / `month` / `allTime`
- `periodWindows`
- `trackedClients`
- `clientStatus`
- `wslStatus`
- `history`

## Limits 流

1. `limitCollector.js` 按 provider probe 本地凭据、CLI、DB 或 API。
2. `limits.js` 统一成 provider 列表。
3. `publicLimits()` 会移除账号标识字段。
4. `syncLimits()` 则保留完整账户信息，用于经过认证的 hub ingest。

### 当前边界

- 私有 hub ingest 可以携带 account identity。
- public stats 必须去掉 `accountKey` / `accountEmail` / `accountLabel` 等身份字段。
- raw token、cookie、refresh token 不应该进入公开接口。

## History 流

history 不是简单的“usage 备份”，而是由 `history.js` 把 device record 里可用的趋势和 session 信息汇总出来，用于：

- Trends 视图。
- dashboard 的概览和热力图。
- 导出文件中的时间序列。

如果某些设备没有 history，聚合时只会得到有限视图，而不是假造数据。

## Sync 流

### Widget -> Hub

在 `client` 模式下，widget 会把本机 record POST 到远端 hub，同时订阅 SSE 更新。

### Agent -> Hub

`src/agent/agent.js` 直接把同样的设备记录 POST 到 hub。

### Host 模式

`host` 模式会在本机启动 embedded hub，并用本机 collector 把数据送进去。

## 数据离开本机的边界

### 会离开本机的数据

- 发送到 hub 的 usage summary。
- 发送到 hub 的 limit snapshot。
- 发往 provider API 的 limit 查询请求。
- 由用户主动导出的 CSV / JSON 文件。

### 不应离开本机的数据

- 继续收集原始 token / session 文件本身。
- raw OAuth token、API key、cookie、refresh token。
- renderer 不需要的完整凭据明文。

### 例外说明

如果用户把导出目录放进同步盘、Obsidian vault 或云盘，那是用户主动引入的外部同步，不是协议层自动上传。

## 持久化点

- collector anchor：`collector-anchor.json`
- agent pid：`agent.pid`
- DeepSeek balance history：`deepseek-balance.json`
- hub device store：`data/devices.json` 或 `userData/hub-devices.json`

这些都是本地持久化，用来支持增量扫描、进程协调或历史聚合。
