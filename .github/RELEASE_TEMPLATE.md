# English

**Open-source build, not paid-signed.** macOS and Windows may ask you to confirm on first launch. Linux AppImage downloads may need executable permission — instructions below.

## What's changed

### Added
- **AI Tool Limits providers:** Settings -> AI Tool Limits now supports GLM / Z.ai, Volcengine, and Qoder quota tracking, with account setup, provider cards, and matching source labels. (#84)
- **Home activity details:** The Home Activity heatmap now shows a per-day token tooltip and highlights the hovered day. (#83)

### Changed
- **New install title style:** Fresh installs now start with the compact title-icon header enabled; existing appearance settings stay unchanged.

### Improved
- **Home activity freshness:** Today's heatmap cell now uses the live Today total, so the Activity chart stays aligned with the headline usage after refreshes or crossing midnight.

### Fixed
- **Codex quota windows:** Short empty Codex quota reads no longer clear recent session or weekly windows, keeping the Codex limits card populated when the CLI/API response is temporarily incomplete.

## Which file should I download?

- **macOS (Apple Silicon, M1 and later)** — the `.dmg` file
- **Windows 10/11** — `Token Monitor Setup ….exe` (installer, recommended)
- **Windows portable** — `Token Monitor ….exe` (runs without installing)
- **Linux x64** — the `.AppImage` file

Other platforms are not pre-built — run from source per the [README](https://github.com/Javis603/token-monitor#readme). The macOS `.zip` is the same app repackaged; ignore it unless you specifically need it.

## First-launch unlock

**macOS:** right-click `Token Monitor.app` → Open (once). If you see "Token Monitor" can't be opened or is damaged:

```bash
xattr -dr com.apple.quarantine "/Applications/Token Monitor.app"
```

**Windows:** SmartScreen → More info → Run anyway.

**Linux:** mark the AppImage executable, then run it:

```bash
chmod +x "Token Monitor"*.AppImage
./"Token Monitor"*.AppImage
```

## tokscale dependency

Tokscale is bundled with this app. See **Settings → Tokscale** for the exact version
and the option to download a newer version directly from npm. Tokscale is MIT,
open-source: https://github.com/junhoyeo/tokscale

---

# 中文

**这是开源构建，不是付费签名版本。** macOS 和 Windows 首次启动时可能会要求你手动确认；Linux AppImage 下载后可能需要先赋予执行权限，操作说明见下方。

## 更新内容

### 新增
- **AI 工具额度提供商：** 设置 -> AI 工具额度 现在支持 GLM / Z.ai、Volcengine 和 Qoder 额度追踪，并提供账号配置、额度卡片和对应的来源标签。（#84）
- **主界面活动详情：** 主界面的活动热力图现在会在悬停时显示每日 token 提示，并高亮当前日期格。（#83）

### 变更
- **新安装默认标题样式：** 全新安装现在默认启用紧凑的标题图标；已有外观设置保持不变。

### 改进
- **主界面活动实时性：** 今日热力图格现在使用实时「今日」总量，刷新或跨过午夜后也会和上方用量一致。

### 修复
- **Codex 额度窗口：** 短暂的空额度读取不会再清掉最近的 session 或 weekly 窗口，CLI/API 临时没有返回完整数据时，Codex 额度卡片仍会保持可用。

## 应该下载哪个文件？

- **macOS（苹果芯片，M1 及之后机型）** — 下载 `.dmg` 安装包
- **Windows 10/11** — 下载 `Token Monitor Setup ….exe`（安装版，推荐）
- **Windows 便携版** — 下载 `Token Monitor ….exe`（无需安装，直接运行）
- **Linux x64** — 下载 `.AppImage` 文件

其他平台暂不提供预构建版本，请参考 [README](https://github.com/Javis603/token-monitor#readme) 从源码运行。macOS 的 `.zip` 只是同一个 app 的重新打包版本，除非你明确需要，否则可以忽略。

## 首次启动放行

**macOS：** 右键 `Token Monitor.app` → 打开（只需要一次）。如果看到「Token Monitor」未开启 或 已损坏：

```bash
xattr -dr com.apple.quarantine "/Applications/Token Monitor.app"
```

**Windows：** SmartScreen → 更多信息 → 仍要运行。

**Linux：** 先给 AppImage 执行权限，然后运行：

```bash
chmod +x "Token Monitor"*.AppImage
./"Token Monitor"*.AppImage
```

## tokscale 依赖

Tokscale 已随应用内置。你可以在 **设置 → Tokscale** 查看确切版本，
也可以直接从 npm 下载更新版本。Tokscale 是 MIT 开源项目：
https://github.com/junhoyeo/tokscale
