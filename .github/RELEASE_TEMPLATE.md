# English

**Open-source build, not paid-signed.** macOS and Windows will ask you to confirm on first launch — instructions below.

## What's changed

### Added
- New **Home** view: a default overview that combines a limits alert, top models, a usage trend, and a 12-month activity heatmap on one screen.
- A scrollable view switcher replaces the single cycle button, so you can jump straight to any view.
- **Windows:** usage from running WSL distributions is now scanned and merged into your totals automatically (on by default).
- **OpenCode multiple accounts:** add several OpenCode accounts as named profiles, each with its own rate-limit tracking. (#24)
- Usage tracking for three more tools: **Pi, Zed, and Kilo Code**. (#25)

### Fixed
- OpenCode session cookies are no longer included in the renderer settings payload.

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
- 全新 **主页** 视图：将额度提醒、热门模型、用量趋势和近 12 个月的活动热力图整合到一个概览页面，并作为默认首页。
- 用可横向滚动的视图切换器取代原本的单一循环按钮，可直接跳转到任意视图。
- **Windows：** 现在会自动扫描正在运行的 WSL 发行版用量并合并进总计（默认开启）。
- **OpenCode 多账号：** 可将多个 OpenCode 账号保存为命名设定档，每个账号都有独立的额度追踪。(#24)
- 新增三个工具的用量追踪：**Pi、Zed 和 Kilo Code**。(#25)

### 修复
- OpenCode 的会话 cookie 不再出现在渲染层的设置数据中。

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
