# MiMo Cloud 前置探测

> **状态：已实现。** MiMo Cloud 已在 v0.25.0 中作为正式 provider 接入（PR #97），支持多账号。
>
> 本文档保留作为早期探测记录，实际实现细节见 [LIMIT_PROVIDERS_AUDIT.md](../audit/LIMIT_PROVIDERS_AUDIT.md)。
>
> 登录架构决策复盘见 [MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md](MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md)。

## 结论

这轮已经确认，`MiMo Cloud` 不是"猜出来的 provider"，而是有真实、本机可复核的数据来源。

最重要的结论：

- `micode` 只代表 MiMo Code 本地 usage
- `mimo` 应该代表 MiMo Cloud / Token Plan / balance / remaining quota
- 两者不能混用
- 真实 source 类型更像 `web`，不是 `api` / `rpc` / `local`

## 本机确认到的存储位置

### 1. MiMoMonitor 目录

当前机器上存在：

- `~/Library/Application Support/MiMoMonitor/config.json`
- `~/Library/Application Support/MiMoMonitor/.key`
- `~/Library/Application Support/MiMoMonitor/history.json`
- `~/Library/Application Support/MiMoMonitor/balance_snapshot.json`
- `~/Library/Application Support/MiMoMonitor/cookies.json`
- `~/Library/Application Support/MiMoMonitor/accounts.json`
- `~/Library/Application Support/MiMoMonitor/endpoints.json`

这说明 MiMo Cloud 登录态是落盘保存的，而且是"加密 cookie / account 文件 + 明文 endpoint/config 文件"的组合。

### 2. MiMo Code 本地数据库

`~/.local/share/mimocode/mimocode.db` 也存在，并且 schema 里能看到：

- `account`
- `account_state`
- `control_account`

但这三个表在当前机器上都是 0 行，所以它们更像是历史遗留或备用 schema，而不是当前可直接依赖的云端登录态主来源。

## 已确认字段

### `config.json`

已确认的 key：

- `platform_url`
- `platform_api_base_url`
- `platform_console_url`
- `token_plan_base_url`
- `token_plan_api_base_url`
- `token_plan_console_url`
- `refresh_interval`
- `language`
- `opacity`
- `always_on_top`
- `mini_mode`
- `auto_start`
- `start_minimized`
- `position`

### `balance_snapshot.json`

已确认的 key：

- `balance`
- `date`
- `gift_balance`

### `endpoints.json`

已确认的 key：

- `console_url`
- `discovered_apis`
- `login_time`

`cookies.json` 与 `accounts.json` 都是加密字符串文件，旁边还有 `.key` 侧车文件。这里只能确认它们是"可持久化的登录态"，不能也不应该在文档里展开敏感值。

## 已发现的 API path

`endpoints.json` 里已经出现的 path 包括：

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

这组 path 说明 MiMo Cloud 的真实数据来源应当按 `web` session 方式处理：本地持久化 cookie 进入 HTTP 请求，然后读返回的 JSON。

## 旧 Token_Widget 实现确认

旧 `tools/mimo_login.py` 的行为可以概括为：

- 登录页固定使用 `https://platform.xiaomimimo.com/console/plan-manage`
- 登录后只读 probe `userProfile`、`tokenPlan/usage`、`usage/token-plan/list`
- 还会补 probe `tokenPlan/detail`、`tokenPlan/list`、`usage/detail/list`、`balance`
- 验证成功后把结果写入 `cookies.json`、`accounts.json`、`endpoints.json`
- `--ui-mode` 成功后会自动退出，不需要人工回车

这套实现已经证明，MiMo Cloud 的"真实数据"不是单一字段，而是三部分拼起来：

- 身份与会话 cookie
- endpoint 发现结果
- 计划 / 余额 / 今日明细

## v0.25.0 实际实现

正式实现（`src/shared/mimoLimits.js`）采用了与早期探测不同的架构：

- **登录方案**：手动 cookie 导入（非内置浏览器登录）
- **凭据存储**：`userData/mimo-credentials/<sha256(id)>.cookie`
- **账号管理**：`settings.mimoManagedAccounts`（支持多账号）
- **数据源**：`platform.xiaomimimo.com/api/v1` 下的 endpoint

## 仍待确认

- 其他机器上的 MiMo Cloud 是否仍然落在同一套 `MiMoMonitor` 目录
- `mimocode.db` 是否在某些版本里会真正写入云端账号信息
- 是否还有 Electron session / keychain / cookie store 作为补充来源

当前结论已经足够支持下一轮实现，但不够支持"凭猜测直接写 provider"。
