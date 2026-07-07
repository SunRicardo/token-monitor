# 开发基线

> 基线：upstream v0.25.0（`6ce2b8f`），2026-07-12 更新。

## 本次审计基线

- 基线提交：`6ce2b8f`（upstream v0.25.0）
- 本地 main 分支：upstream v0.25.0 + 1 个 docs commit
- 工作区状态：干净

## 环境信息

- Node.js：`v22.22.3`
- npm：`10.9.8`

## v0.25.0 变更摘要

upstream v0.25.0 包含以下重要变更：

1. **feat(mimo): add multi-account limits**（PR #97）— MiMo Cloud 正式接入，支持多账号
2. **feat(limits): add Ollama Cloud usage provider**（PR #98）— Ollama Cloud 全新 provider
3. **fix(limits): stabilize Codex quota refreshes**（PR #116）— Codex 刷新稳定性
4. **fix(sync): bound usage payloads and return 413**（PR #121）— Sync payload 大小限制
5. **fix(limits): mark the local Codex login**（PR #126）— 活跃账号标记修正
6. **fix(trends): retain offline history and refresh dashboard**（PR #127）— 离线历史持久化
7. **fix(limits): shrink active account checkmark on Windows** — UI 微调

## 安装结果

`npm install` 已执行并成功。

## 验证结果

v0.25.0 的测试数量相比上一审计基线有显著增长（新增 mimoLimits.test.js、ollamaLimits.test.js、syncPayload.test.js 等）。

## 可运行情况

当前基线下，项目的静态检查和测试都处于可通过状态。

## 已知问题 / 注意事项

1. 本机 `~/.npm` 缓存权限曾经影响安装。
2. 依赖某些外部账号的 provider，仍然需要真实凭据和实际环境才能验证。
3. CI 之外的 live 集成（例如实际 limit provider 登录）不在本次 `verify` 的覆盖范围内。
