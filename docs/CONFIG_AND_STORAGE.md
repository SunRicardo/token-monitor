# 配置与存储

## 配置优先级

当前项目里，配置来源不是单一的。需要分成三层看：

1. 系统环境变量 / CLI flag。
2. 项目根目录 `.env`。
3. Electron widget 的 `settings.json`。

相关逻辑主要在：

- `src/shared/config.js`
- `src/electron/main.js`

### `.env`

`loadDotEnv()` 会读取项目根目录的 `.env`，并且只填补 `process.env` 里还不存在的键。也就是说：

- 真正的系统环境变量优先。
- `.env` 是方便本地开发和默认值的补充。

### widget settings

Electron widget 的持久化设置文件位于：

- `app.getPath('userData')/settings.json`

这个文件会保存界面和账号相关配置。`readSettings()` 会把默认值和已保存值合并。

## Shared data 目录

`src/shared/config.js` 里的 `sharedDataDir()` 是跨进程共享数据目录，支持用 `TOKEN_MONITOR_SHARED_DIR` 覆盖。

默认路径大致是：

- macOS: `~/Library/Application Support/Token Monitor`
- Windows: `%APPDATA%/Token Monitor`
- Linux: `~/.config/Token Monitor`

这个目录里常见的持久化文件有：

- `agent.pid`
- `collector-anchor.json`
- `deepseek-balance.json`

## Hub / device 存储

### Node hub

Node hub 默认把 device records 存到：

- `data/devices.json`

### Embedded hub

host 模式下，主进程里启动的 embedded hub 使用：

- `app.getPath('userData')/hub-devices.json`

### Worker hub

Cloudflare Worker 版本不使用本地 JSON 文件，而是依赖它自己的运行时存储。

## 凭据与账号状态

### 主进程里保存的敏感项

`src/electron/main.js` 中能看到的敏感设置包括：

- `deepseekApiKey`
- `minimaxApiKey`
- `copilotApiToken`
- `opencodeCookie`
- `opencodeProfiles`
- `codexManagedAccounts`

其中 renderer 不会看到原始 secret 的完整值，主进程会做脱敏后再下发。

### 文件或系统级凭据

- Claude：环境变量、`~/.claude/.credentials.json`、Keychain / Credential Manager。
- Codex：`~/.codex/auth.json` 或 `CODEX_HOME/auth.json`。
- Cursor：`~/.config/tokscale/cursor-credentials.json`。
- Grok：`~/.grok/auth.json`。
- OpenCode：本地 DB + cookie / profile。

## 数据边界

### 会离开本机的数据

- 发往 hub 的 usage summary。
- 发往 hub 的 limits summary。
- 发往 provider API 的限额查询请求。
- 用户主动导出的 CSV / JSON。

### 不应该离开的数据

- 账号明文 token。
- refresh token。
- cookie 原文。
- 本地 DB 里不需要公开的 account identity。

### 公开接口的脱敏

`publicLimits()` 会去掉账号身份字段，所以 public stats 不应泄露 limit 账号标识。这个约束在 `src/shared/limits.js` 和 `worker/src/index.js` 的 public endpoint 中都能看到。

## 审计备注

1. 配置不是“只靠 `.env`”，widget 还有 UI settings。
2. 账号状态有时会以“已配置”而不是“明文值”形式传给 renderer。
3. 如果用户把导出目录放进同步盘，属于用户主动同步，不是协议自动上传。
