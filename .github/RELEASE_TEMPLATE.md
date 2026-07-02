# English

**Open-source build, not paid-signed.** macOS and Windows will ask you to confirm on first launch — instructions below.

## What's changed

### Added
- **Claude Fable weekly cap:** Claude now shows a temporary Fable-only weekly window.

### Changed
- **Usage Trends setup:** Fresh installs collect Trends history by default, saved opt-out settings stay off, and Settings now includes 5, 10, 15, 30, or 60 minute scan intervals.

### Improved
- **Bundled Tokscale 4.0.9:** fixes Grok `signals.json` compaction-total reconciliation and parses Kiro execution files plus GitHub Copilot Desktop SQLite usage.
- **Hermes profile tracking:** Hermes Agent scans now include profile databases under the Hermes home folder or Windows `LOCALAPPDATA`, so profile-specific usage updates live with the rest of the tool list. (#43)
- **Home overview polish:** Home device rows now prioritize the highest-usage devices, disabled Trends has a direct turn-on action, and active tools are labeled as "Tracking" instead of "Detecting."

### Fixed
- **Archived client breakdowns:** cache hit, cache write, and output-token splits are restored when archived or untracked client sessions are shown in expanded rows.

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
- **Claude Fable 每周上限：** Claude 现在会显示临时的 Fable-only 每周窗口。

### 变更
- **使用趋势设定：** 全新安装会默认采集趋势历史，已保存的关闭设定仍会保留；设置中也新增每 5、10、15、30、60 分钟扫描的间隔选项。

### 改进
- **升级内置 Tokscale 至 4.0.9：** 修复 Grok `signals.json` 压缩总量对账，并解析 Kiro 执行文件与 GitHub Copilot Desktop SQLite 用量。
- **Hermes 设定档追踪：** Hermes Agent 现在会扫描 Hermes home 或 Windows `LOCALAPPDATA` 下的 profile 数据库，profile 用量也会随工具列表一起更新。（#43）
- **主页概览细节：** 主页设备列表现在优先显示用量最高的设备；趋势关闭时有直接启用按钮；活跃工具状态也从“检测中”改为“追踪中”。

### 修复
- **归档客户端明细：** 展开已归档或未追踪客户端的 session 时，会恢复缓存命中、缓存写入和输出 token 拆分，不再全部落到粗略明细里。

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
