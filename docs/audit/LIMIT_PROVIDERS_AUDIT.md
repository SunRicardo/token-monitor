# Limit Provider 审计

> 基线：upstream v0.25.0（`6ce2b8f`），2026-07-12 更新。

## 结论

当前代码支持的 limit provider 共 17 个：

- `claude`
- `codex`
- `cursor`
- `antigravity`
- `opencode`
- `deepseek`
- `minimax`
- `mimo`
- `grok`
- `copilot`
- `kiro`
- `zai`
- `volcengine`
- `qoder`
- `zaiteam`
- `kimi`
- `ollama`

来源：`VALID_PROVIDERS` in `src/shared/limits.js`，`LIMIT_PROVIDER_IDS` in `src/shared/limitCollector.js`。

## 逐项说明

| Provider | 实现文件 | 采集方式 | 凭据 / 存储位置 | 备注 |
|---|---|---|---|---|
| `claude` | — | OAuth / CLI / 本地凭据探测 | `CLAUDE_CODE_OAUTH_TOKEN`，`~/.claude/.credentials.json`，或 `CLAUDE_CONFIG_DIR`，可走 Keychain / Credential Manager | 支持账户标识，公开统计脱敏 |
| `codex` | — | CLI / auth 文件 / managed account | `~/.codex/auth.json` 或 `CODEX_HOME/auth.json`；managed accounts 在 Electron `settings.json`，每个账号独立 `CODEX_HOME` | 支持多账号；v0.25.0 修复了活跃账号标记和 quota 刷新稳定性 |
| `cursor` | — | 本地 credentials 文件 | `~/.config/tokscale/cursor-credentials.json` | 本地文件型凭据 |
| `antigravity` | — | 本地进程 / 端口 probe | 没有单独 token 文件 | 依赖正在运行的 IDE/CLI 进程 |
| `opencode` | — | 本地 DB + web cookie / profile | `opencode.db`，`TOKEN_MONITOR_OPENCODE_COOKIE` / `settings.opencodeCookie` / `settings.opencodeProfiles` | 公开接口不应暴露 cookie |
| `deepseek` | — | API key + REST API | `DEEPSEEK_API_KEY` 或 `DEEPSEEK_KEY`，或 widget 设置 `deepseekApiKey` | 额外有本地余额历史文件 |
| `minimax` | — | API key | `MINIMAX_CODING_API_KEY` 或 widget 设置 `minimaxApiKey` | 仅 coding 相关 key |
| `mimo` | `src/shared/mimoLimits.js` | web cookie（手动浏览器导入） | `settings.mimoManagedAccounts` + `userData/mimo-credentials/<hash>.cookie` | v0.25.0 正式接入（PR #97）；支持多账号；维护者改为手动 cookie 导入方案 |
| `grok` | — | bearer token / auth JSON | `GROK_BEARER_TOKEN` 或 `~/.grok/auth.json`（通过 `GROK_HOME`），可配 `GROK_CLI_PATH` | CLI 与本地 auth 并存 |
| `copilot` | — | GitHub token / device flow | `COPILOT_API_TOKEN`，`GITHUB_COPILOT_TOKEN`，或 widget 设置 `copilotApiToken` | 登录链路走 GitHub device flow |
| `kiro` | — | CLI only | `kiro-cli`，可用 `TOKEN_MONITOR_KIRO_COMMAND` 覆盖 | 没有独立 token 文件 |
| `zai` | — | API key | — | Z.ai GLM Coding Plan |
| `volcengine` | — | API key / AK-SK | — | Ark Coding Plan |
| `qoder` | — | dashboard cookie | — | 大模型积分 |
| `zaiteam` | — | API key | — | Z.ai 团队版 |
| `kimi` | — | API key / CLI | — | Kimi Code 配额 |
| `ollama` | `src/shared/ollamaLimits.js` | web cookie（手动浏览器导入） | `settings.ollamaSessionCookie` | v0.25.0 新增（PR #98）；读取 ollama.com/settings 的 session/weekly 使用量 |

## MiMo Provider 实现细节

MiMo 在 v0.25.0 中作为正式 provider 接入（PR #97），支持多账号。

### 架构

- **实现文件**：`src/shared/mimoLimits.js`
- **凭据存储**：每个账号一个 cookie 文件，路径为 `userData/mimo-credentials/<sha256(id)>.cookie`
- **账号列表**：`settings.mimoManagedAccounts`（Electron settings.json）
- **数据源**：`platform.xiaomimimo.com` 的 web API（通过浏览器 cookie 认证）

### 登录方案

维护者最终采用手动 cookie 导入方案（非内置浏览器登录）：

1. 用户在系统浏览器登录 `platform.xiaomimimo.com`
2. 从浏览器 DevTools Network 面板复制 `Cookie` header
3. 粘贴到 Token Monitor 设置页
4. 应用验证 cookie、保存最小 allowlist、请求官方 endpoint

详细架构决策复盘见 [MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md](../providers/MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md)。

### 数据来源

- 早期探测阶段的发现记录在 [MIMO_CLOUD_DISCOVERY.md](../providers/MIMO_CLOUD_DISCOVERY.md)
- 正式实现使用 `platform.xiaomimimo.com/api/v1` 下的 endpoint
- provider id：`mimo`（与本地 usage 的 `micode` 严格区分）

## Ollama Cloud Provider

Ollama Cloud 在 v0.25.0 中作为全新 provider 接入（PR #98）。

### 架构

- **实现文件**：`src/shared/ollamaLimits.js`
- **凭据存储**：`settings.ollamaSessionCookie`
- **数据源**：`ollama.com/settings` 页面的 session/weekly 使用量
- **采集方式**：通过 session cookie 请求 Ollama web 接口

## 公共 / 私有边界

`src/shared/limits.js` 里有两套输出：

- `syncLimits()`：给认证 hub ingest 用，保留完整账户信息。
- `publicLimits()`：给公开 stats 用，移除 `accountKey`、`accountEmail`、`accountName`、`accountLabel` 等身份字段。

这意味着：

- 认证 hub 可以做账号级别聚合。
- public endpoint 只能看到匿名化结果。

## 审计备注

1. 不是所有 provider 都是"API key"型。MiMo 和 Ollama 都是 web cookie 型。
2. 有些 provider 依赖本地 DB、浏览器 cookie、OS keychain 或 CLI RPC。
3. UI 中显示的"已配置"状态不等于真实 token 已暴露给 renderer；主进程会做脱敏。
4. v0.25.0 的 Codex 相关修复包括：quota 刷新稳定性（PR #116）、活跃账号标记修正（PR #126）。
5. v0.25.0 新增了 sync payload 大小限制和 413 响应（PR #121）。
