# 本地 Client 审计

## 结论

当前代码已经把一组本地 client 纳入追踪和规范化。默认启用的列表来自 `src/shared/clientTracking.js`，WSL 场景下的额外识别来自 `src/shared/wslUsage.js`，名称统一逻辑在 `src/shared/usage.js`。

注意：这里的“支持”是指“代码层面会尝试识别并归一化”，不等于你机器上一定有数据。真正是否能采到，还取决于本机是否安装了对应工具、数据目录是否存在，以及 tokscale 是否能读到那个来源。

## 默认追踪的 client

`DEFAULT_CLIENTS` 当前包含：

- `claude`
- `codex`
- `hermes`
- `opencode`
- `openclaw`
- `cursor`
- `antigravity`
- `cline`
- `kimi`
- `qwen`
- `grok`
- `copilot`
- `pi`
- `zed`
- `kilocode`
- `zcode`
- `kiro`
- `codebuddy`
- `workbuddy`

相关位置：

- `src/shared/clientTracking.js`
- `src/shared/collector.js`
- `src/shared/usage.js`

## 额外识别的 client

`KNOWN_CLIENTS` 里还包含：

- `micode`

但它**不是默认追踪项**。代码里明确说明它是 opt-in，因为 `mimocode.db` 会和 Claude import 路径产生重复计数风险。

## WSL 识别范围

在 Windows 场景下，`src/shared/wslUsage.js` 会通过 `\\wsl$` 补充识别运行中的 WSL distro 内数据。当前能通过 WSL marker 归一化出来的 client 包括：

- `claude`
- `codex`
- `opencode`
- `openclaw`
- `hermes`
- `kimi`
- `qwen`
- `grok`
- `copilot`
- `cline`
- `pi`
- `zed`
- `kilocode`
- `micode`
- `zcode`
- `kiro`
- `codebuddy`
- `workbuddy`

其中 `zed` 还有 host fallback gate，避免在 WSL home 里没有对应本地文件时误扫宿主机数据库。

## 当前 UI / 统计里能看到什么

这些 client 不是全部都有同等颗粒度的派生字段，但至少会进入以下归一化路径：

- 日常 usage 汇总。
- client 维度统计。
- 与 model 维度相关的拆分展示。
- 部分场景下的 session detail / history 聚合。

## 审计备注

1. `clientTracking.js` 是默认名单来源。
2. `wslUsage.js` 决定 Windows 下从哪些 WSL 路径补充识别。
3. `usage.js` 决定最终展示时名称如何统一。
4. 若要新增 client，不能只改一个地方，至少要同步更新 tracking、watch path、normalization、UI 映射和测试。
5. 2026-07-07 复核：当前机器上的 `tokscale --json --client micode --today --group-by client,model` 可正常执行并返回 0，说明 `micode` 已被 tokscale 接受为有效 client。
6. 2026-07-07 复核：当前机器存在 `~/.local/share/mimocode/mimocode.db`，因此 MiMo Code 的本地数据目录在真实环境里可确认；其他机器仍需要真实环境验证，不要凭空假设路径存在。
7. `micode` 仍保持 opt-in，不加入 `DEFAULT_CLIENTS`，原因是默认启用会扩大扫描范围，并可能把 `mimocode.db` 里的 Claude import 历史一起算进来，带来重复计数风险。
