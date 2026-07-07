# Limit Provider 审计

## 结论

当前代码支持的 limit provider 包括：

- `claude`
- `codex`
- `cursor`
- `antigravity`
- `opencode`
- `deepseek`
- `minimax`
- `grok`
- `copilot`
- `kiro`

相关实现主要在：

- `src/shared/limitCollector.js`
- `src/shared/limits.js`
- `src/electron/main.js`
- `src/electron/renderer/app.js`

## 逐项说明

| Provider | 当前采集方式 | 凭据 / 存储位置 | 备注 |
|---|---|---|---|
| `claude` | OAuth / CLI / 本地凭据探测 | `CLAUDE_CODE_OAUTH_TOKEN`，`~/.claude/.credentials.json`，或 `CLAUDE_CONFIG_DIR`，并可能走 Windows Credential Manager / macOS Keychain | 支持账户标识，但公开统计会脱敏 |
| `codex` | CLI / auth 文件 / managed account | `~/.codex/auth.json` 或 `CODEX_HOME/auth.json`；managed accounts 存在 Electron `settings.json`，并为每个账号建独立 `CODEX_HOME` | 支持多账号 |
| `cursor` | 本地 credentials 文件 | `~/.config/tokscale/cursor-credentials.json` | 本地文件型凭据 |
| `antigravity` | 本地进程 / 端口 probe | 没有单独 token 文件 | 依赖正在运行的 IDE/CLI 进程 |
| `opencode` | 本地 DB + web cookie / profile | `opencode.db`，以及 `TOKEN_MONITOR_OPENCODE_COOKIE` / `settings.opencodeCookie` / `settings.opencodeProfiles` | 公开接口不应暴露 cookie |
| `deepseek` | API key + REST API | `DEEPSEEK_API_KEY` 或 `DEEPSEEK_KEY`，也可来自 widget 设置 `deepseekApiKey` | 额外有本地余额历史文件 |
| `minimax` | API key | `MINIMAX_CODING_API_KEY` 或 widget 设置 `minimaxApiKey` | 当前仅看到 coding 相关 key |
| `grok` | bearer token / auth JSON | `GROK_BEARER_TOKEN` 或 `~/.grok/auth.json`（通过 `GROK_HOME`），可配 `GROK_CLI_PATH` | CLI 与本地 auth 并存 |
| `copilot` | GitHub token / device flow | `COPILOT_API_TOKEN`，`GITHUB_COPILOT_TOKEN`，或 widget 设置 `copilotApiToken` | 登录链路走 GitHub device flow |
| `kiro` | CLI only | `kiro-cli`，可用 `TOKEN_MONITOR_KIRO_COMMAND` 覆盖 | 没有独立 token 文件 |

## 公共 / 私有边界

`src/shared/limits.js` 里有两套输出：

- `syncLimits()`：给认证 hub ingest 用，保留完整账户信息。
- `publicLimits()`：给公开 stats 用，移除 `accountKey`、`accountEmail`、`accountName`、`accountLabel` 等身份字段。

这意味着：

- 认证 hub 可以做账号级别聚合。
- public endpoint 只能看到匿名化结果。

## 当前不在代码里的 provider

以下名称是合理的后续扩展方向，但**不属于当前代码审计到的实现**：

- `MiMo Cloud`
- `GLM Cloud`

如果后续要加它们，应该先确认它们的 credential model 和 public redaction 规则，再决定是否接入 `limitCollector.js`。

## MiMo Cloud 只读发现

本轮已经在本机确认，`MiMo Cloud` 不是“假 provider”而是有真实、可复核的数据来源：

- 账号 / 登录态目录：`~/Library/Application Support/MiMoMonitor/`
- 本地 MiMo Code 数据库：`~/.local/share/mimocode/mimocode.db`
- 旧实现的 login tool：`/Users/huchang/Desktop/Vibe_Coding/Token_Widget/tools/mimo_login.py`

### 目录与字段

`MiMoMonitor` 目录下当前可见的文件包括：

- `config.json`
- `.key`
- `history.json`
- `balance_snapshot.json`
- `cookies.json`
- `accounts.json`
- `endpoints.json`

只读检查到的顶层字段：

| 文件 | 已确认字段 |
|---|---|
| `config.json` | `platform_url`, `platform_api_base_url`, `platform_console_url`, `token_plan_base_url`, `token_plan_api_base_url`, `token_plan_console_url`, `refresh_interval`, `language`, `opacity`, `always_on_top`, `mini_mode`, `auto_start`, `start_minimized`, `position` |
| `balance_snapshot.json` | `balance`, `date`, `gift_balance` |
| `endpoints.json` | `console_url`, `discovered_apis`, `login_time` |

`cookies.json` 与 `accounts.json` 是加密字符串文件，旁边有 `.key` 侧车文件；这说明当前登录态是落盘保存的，不是只存在内存里。

`~/.local/share/mimocode/mimocode.db` 里能看到 `account`、`account_state`、`control_account` 这些表结构，但当前行数为 0。也就是说，本机可确认的云端登录态不靠这几个表“直接承载”，真正有内容的是 `MiMoMonitor` 目录。

### 只读 endpoint 探测

`endpoints.json` 里已出现的 API path 包括：

- `/api/v1/userProfile`
- `/api/v1/auth/verificationStatus`
- `/api/v1/auth/enterpriseStatus`
- `/api/v1/auth/nonMainlandUserStatus`
- `/api/v1/tokenPlan/usage`
- `/api/v1/tokenPlan/detail`
- `/api/v1/tokenPlan/list`
- `/api/v1/usage/token-plan/list`
- `/api/v1/usage/detail/list`
- `/api/v1/tokenPlan/usage/detail/list`
- `/api/v1/balance`
- `/api/v1/user/balance`
- `/api/v1/balanceAlertConfig`
- `/api/v1/tokenPlan/apiKey`
- `/api/v1/tokenPlan/apiKey/raw`

这已经足够判断：`mimo` 的真实数据源应该是 `web`，而不是 API key / RPC / local-only mock。

### 旧实现给出的可迁移结论

旧 `tools/mimo_login.py` 的关键结论是：

- 登录入口固定为 `https://platform.xiaomimimo.com/console/plan-manage`
- 只读验证依赖 `userProfile` + `tokenPlan/usage` + `usage/token-plan/list`
- 额外会 probe `tokenPlan/detail`、`tokenPlan/list`、`usage/detail/list`、`balance`
- 通过后写入 `cookies.json` / `accounts.json` / `endpoints.json`
- `--ui-mode` 成功后自动退出，不等待终端回车

对 token-monitor 的含义是：

- provider id 应该是 `mimo`
- `micode` 继续只表示本地 MiMo Code usage，不要混成同一个 provider
- 最合理的 source 类型是 `web`
- 初版接入不需要伪造字段，只需要读真实 session 文件并调用已确认的 endpoint

### 仍待确认

- 其他机器上 MiMo Code 是否还会把云端登录态写到同一套 `MiMoMonitor` 目录
- `mimocode.db` 的 account schema 是否只是历史遗留，还是某些版本会写入云端登录信息
- 是否还有 Electron session / keychain / cookie store 作为补充来源

结论：本机已经确认 `mimo` 的真实数据来源，且可迁移思路明确，不需要再靠猜接口做假 provider。

## 审计备注

1. 不是所有 provider 都是“API key”型。
2. 有些 provider 依赖本地 DB、浏览器 cookie、OS keychain 或 CLI RPC。
3. UI 中显示的“已配置”状态不等于真实 token 已暴露给 renderer；主进程会做脱敏。
