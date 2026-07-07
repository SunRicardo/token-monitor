# UI 结构

## 总体说明

当前 UI 主要由两块组成：

- 主 widget 窗口：`src/electron/renderer/index.html` + `app.js`
- dashboard 窗口：`src/electron/renderer/dashboard.html` + `dashboard.js`

renderer 的职责是把数据拆成不同视图，而不是重新计算原始采集逻辑。

## 主窗口结构

`src/electron/renderer/index.html` 当前可见结构大致如下：

### 顶部栏

- period tabs：`DAY` / `MONTH` / `TOTAL`
- window controls
- 右侧的状态和快捷入口

### 主内容区

- `total-panel`
- `homePanel`
- `breakdown`
- `session-detail-head`
- `session-detail`
- `serviceStatusPanel`
- `limitsPanel`
- `trendsPanel`

### 底部 / 浮层

- `viewSwitcher`
- app update pill
- settings button
- floating bubble tab

## Settings 面板

Settings panel 按区块组织，当前有：

- `general`
- `main`
- `window`
- `appearance`
- `tools`
- `limits`
- `accounts`
- `sync`

### `tools`

这一组里包含：

- client 优先级列表
- 采集频率
- WSL 扫描开关 / 面板
- 导出设置
- 自定义价格

### `limits`

这一组里包含：

- provider 选择
- 刷新间隔
- 是否显示 source
- 是否显示 active account
- remaining / used bars 的显示方式

### `accounts`

这里分别放：

- Codex
- Cursor
- OpenCode
- DeepSeek
- Minimax
- Copilot

### `sync`

这里控制：

- local / client / host 模式
- hub URL
- shared secret
- port
- device id

## `app.js` 的视图逻辑

`src/electron/renderer/app.js` 目前暴露的主要视图分类包括：

- `home`
- `tool`
- `status`
- `device`
- `model`
- `session`
- `limits`
- `trends`

Home 页内部还会按模块切换：

- `limits`
- `tool`
- `device`
- `model`
- `trends`

当 history 关闭时，`trends` 会从可用视图里移除。

## dashboard 窗口

`src/electron/renderer/dashboard.html` / `dashboard.js` 负责更完整的趋势和概览页，结构上有两个核心 tab：

- Overview
- Trends

这个窗口更偏分析视图，包含：

- cards
- heatmap
- breakdown
- trend chart
- legend / mode / range 控件

## 审计结论

当前 UI 已经不是单一主页，而是“主 widget + dashboard + settings + floating UI”的组合。后续做定制时，最好在 renderer 层做模块化拆分，而不要把采集逻辑搬进视图层。
