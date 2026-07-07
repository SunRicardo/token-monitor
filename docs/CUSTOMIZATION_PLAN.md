# 二次开发建议计划

这份计划不是功能实现说明，而是基于当前代码结构给后续定制开发的落点建议。核心原则是：**保持 collector / hub / worker 协议不变，把变化尽量放在 renderer、主进程配置层和 provider 扩展层。**

## 1. 主界面改成 local monitoring / cloud monitoring 双面板

建议把当前首页拆成两个清晰区域：

- local monitoring：本机 token usage、session、history、WSL 扫描。
- cloud monitoring：limit provider、账号状态、刷新状态、异常态。

实现上尽量只改 renderer 组合层，例如：

- `src/electron/renderer/app.js`
- `src/electron/renderer/homeOverview.js`
- `src/electron/renderer/index.html`

不要先改 `src/shared/collector.js` 的输出协议。

## 2. 两个面板可折叠

折叠功能建议做成纯 UI 状态，不改变数据结构。

优先考虑：

- 保存折叠状态到 `settings.json`
- 在 renderer 内按 section 级别控制显示/隐藏
- 保持内容顺序不变，减少未来 merge 冲突

## 3. 云端账号异常时在主界面直接刷新 / 重新登录

这类能力应该做成“账号级动作”，而不是重做整个限额系统。

建议做法：

- 在 `accounts` 区块里直接展示账号状态。
- 为已检测到异常的 provider 提供 inline refresh。
- 复用现有主进程 IPC，不要把 secret 暴露给 renderer。

如果 provider 本身支持重新登录或重新授权，优先沿用现有 provider adapter 的行为。

## 4. 后续补充 MiMo Cloud / GLM Cloud

新增 provider 时，建议先确认三件事：

- 凭据模型是什么。
- 是否有公开 endpoint 和私有 endpoint 的区别。
- 需要保留哪些账号身份字段，哪些必须在 public API 中脱敏。

对 `MiMo Cloud` 的当前建议是：

- provider id 用 `mimo`
- source 类型按 `web` 设计
- 真实数据源来自本机已持久化的 MiMo 登录态与 endpoint 发现结果，不要造假字段
- 先实现只读提取，再考虑是否需要“重新登录”动作

接入落点建议优先放在：

- `src/shared/mimoLimits.js`（建议新增，集中放 MiMo 目录发现、session 读取、endpoint probe、字段归一化）
- `src/shared/limitCollector.js`
- `src/shared/limits.js`
- `src/electron/main.js`
- `src/electron/renderer/app.js`

MiMo 的账号卡建议沿用现有 `accounts` 分组的模式，但状态规则要和 `micode` 严格分开：

- `notConfigured`：没有可读的 MiMo session 文件、cookie 文件或 endpoint 发现结果
- `unauthorized`：session 已存在，但 `userProfile` / `tokenPlan/usage` 返回 401/403，或验证结果明确过期
- `ok`：`userProfile` 与至少一个 `tokenPlan` / `usage` / `balance` endpoint 成功
- `sourceRateLimited`：HTTP 429
- `unavailable`：endpoint 存在但服务不可用、响应异常或字段缺失
- `error`：其他未分类错误

limitsPanel / 后续云端监测面板建议显示的字段：

- Token Plan `used / limit / remainingPercent`
- `balance` / `gift_balance`
- `today_token_total`
- `latest_model_usage_date`
- `today_usage_basis`
- `degraded_reason` / `session_expired` 类诊断状态

如果后续要加“重新登录”动作，优先复用现有的 `openExternal` + `refreshStats({ force: true })` 模式，不要把 secret 或 cookie 下发到 renderer。

补充说明：MiMo Code 的本地监控已经接入现有 client 体系，Tools 设置页也可以启用或禁用它；这里不需要再拆出单独的 local 方案。它仍然保持 opt-in，不建议在 tokscale 上游没有完成 Claude import 去重前直接并入 `DEFAULT_CLIENTS`，否则默认扫描范围会扩大，而且 `mimocode.db` 可能把 Claude import 历史一并算进去。

## 5. 保持上游可合并性

这是最重要的约束。建议采用下面的策略：

- 不改 `/api/ingest`、`/api/stats`、`/api/history` 的协议形状。
- 不重命名 shared 层的核心数据字段。
- UI 改动尽量做成新增组件或局部重排，而不是整页推翻。
- 新 provider 先做最小可用支持，再逐步补 UI。
- 对应测试要先补，再扩行为。

## 推荐实施顺序

1. 先重排主界面为 local / cloud 双面板。
2. 再做折叠状态和小型交互优化。
3. 然后补账号异常时的就地刷新 / 重新登录。
4. 最后再扩 MiMo Cloud / GLM Cloud 这类新增 provider。

## 一句话原则

**如果一项改动会让 `src/shared/` 的协议层、hub wire shape 或 worker 兼容性变复杂，就应先想办法把它留在 renderer 或 settings 层解决。**
