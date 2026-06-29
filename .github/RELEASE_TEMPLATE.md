# English

**Open-source build, not paid-signed.** macOS and Windows will ask you to confirm on first launch — instructions below.

## What's changed

### Added
- **Kiro usage tracking:** collect Kiro CLI, Kiro IDE globalStorage, and `kiro-cli` usage, including Kiro activity from running WSL distros on Windows.
- **Kiro limits support:** show Kiro quota windows in AI Tool Limits, Home, and tray/floating limit bars. (#41)
- **Customizable Home modules:** Settings -> Main Screen now lets you choose which Home modules appear, reorder them, and separately tune Home limit providers.

### Improved
- Tokscale is bundled at **4.0.5**, including the MiMo Code scan-path fix.
- Kiro watch paths now cover CLI sessions, IDE globalStorage, and `kiro-cli` databases so usage refreshes within seconds after new activity.
- MiMo Code scanning now uses the correct `~/.local/share/mimocode` data path while remaining available as an opt-in tracked tool.

### Fixed
- Home no longer blanks the Activity/Trend module during cold starts before full history loads. (#39)
- Broken stdout/stderr pipes no longer show noisy main-process error dialogs. (#35)
- MiMo Code is no longer tracked by default because its database can import Claude Code sessions and double-count Claude usage; it can still be enabled from Settings.

## Which file should I download?

- **macOS (Apple Silicon, M1 and later)** — the `.dmg` file
- **Windows 10/11** — `Token Monitor Setup ….exe` (installer, recommended)
- **Windows portable** — `Token Monitor ….exe` (runs without installing)

Intel Macs and Linux are not pre-built — run from source per the [README](https://github.com/Javis603/token-monitor#readme). The macOS `.zip` is the same app repackaged; ignore it unless you specifically need it.

## First-launch unlock

**macOS:** right-click `Token Monitor.app` → Open (once). If you see "Token Monitor" can't be opened or is damaged:

```bash
xattr -dr com.apple.quarantine "/Applications/Token Monitor.app"
```

**Windows:** SmartScreen → More info → Run anyway.

## tokscale dependency

Tokscale is bundled with this app. See **Settings → Tokscale** for the exact version
and the option to download a newer version directly from npm. Tokscale is MIT,
open-source: https://github.com/junhoyeo/tokscale

---

# 中文

**这是开源构建，不是付费签名版本。** macOS 和 Windows 首次启动时会要求你手动确认，操作说明见下方。

## 更新内容

### 新增
- **Kiro 用量追踪：** 采集 Kiro CLI、Kiro IDE globalStorage 与 `kiro-cli` 用量，并在 Windows 上自动并入运行中的 WSL 发行版里的 Kiro 用量。
- **Kiro 额度支持：** 在 AI 工具限制、主页、托盘/悬浮额度条中显示 Kiro 额度窗口。(#41)
- **主页模块自定义：** 设置 -> 主界面 现在可以选择主页显示哪些模块、调整顺序，并单独配置主页额度提供者。

### 改进
- Tokscale 已内置升级到 **4.0.5**，包含 MiMo Code 扫描路径修复。
- Kiro 监听路径现在覆盖 CLI sessions、IDE globalStorage 与 `kiro-cli` 数据库，新活动后可在数秒内刷新用量。
- MiMo Code 扫描现在使用正确的 `~/.local/share/mimocode` 数据路径，并继续作为可手动开启的追踪工具提供。

### 修复
- 主页冷启动时不再因为完整历史尚未加载而清空活动/趋势模块。(#39)
- stdout/stderr 管道断开时不再弹出嘈杂的主进程错误提示。(#35)
- MiMo Code 不再默认追踪，因为它的数据库可能导入 Claude Code session 并造成 Claude 用量重复计算；仍可在设置中手动启用。

## 应该下载哪个文件？

- **macOS（苹果芯片，M1 及之后机型）** — 下载 `.dmg` 安装包
- **Windows 10/11** — 下载 `Token Monitor Setup ….exe`（安装版，推荐）
- **Windows 便携版** — 下载 `Token Monitor ….exe`（无需安装，直接运行）

Intel Mac 和 Linux 暂不提供预构建版本，请参考 [README](https://github.com/Javis603/token-monitor#readme) 从源码运行。macOS 的 `.zip` 只是同一个 app 的重新打包版本，除非你明确需要，否则可以忽略。

## 首次启动放行

**macOS：** 右键 `Token Monitor.app` → 打开（只需要一次）。如果看到「Token Monitor」未开启 或 已损坏：

```bash
xattr -dr com.apple.quarantine "/Applications/Token Monitor.app"
```

**Windows：** SmartScreen → 更多信息 → 仍要运行。

## tokscale 依赖

Tokscale 已随应用内置。你可以在 **设置 → Tokscale** 查看确切版本，
也可以直接从 npm 下载更新版本。Tokscale 是 MIT 开源项目：
https://github.com/junhoyeo/tokscale
