# 二次开发建议计划

> 基线：upstream v0.25.0（`6ce2b8f`），2026-07-12 更新。

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

这类能力应该做成"账号级动作"，而不是重做整个限额系统。

建议做法：

- 在 `accounts` 区块里直接展示账号状态。
- 为已检测到异常的 provider 提供 inline refresh。
- 复用现有主进程 IPC，不要把 secret 暴露给 renderer。

如果 provider 本身支持重新登录或重新授权，优先沿用现有 provider adapter 的行为。

## 4. ~~后续补充 MiMo Cloud~~ ✅ 已完成

MiMo Cloud 已在 v0.25.0 中作为正式 provider 接入（PR #97），支持多账号。实现位于 `src/shared/mimoLimits.js`，凭据存储在 `userData/mimo-credentials/` 下。

登录方案采用手动 cookie 导入（非内置浏览器登录），详见 [MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md](../providers/MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md)。

### GLM Cloud

GLM Cloud（`zai` / `zaiteam`）已在 upstream 中作为 API key 型 provider 实现。如果需要进一步定制，参考现有的 `limits.js` 归一化逻辑。

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
4. 最后再扩其他新增 provider。

## 一句话原则

**如果一项改动会让 `src/shared/` 的协议层、hub wire shape 或 worker 兼容性变复杂，就应先想办法把它留在 renderer 或 settings 层解决。**
