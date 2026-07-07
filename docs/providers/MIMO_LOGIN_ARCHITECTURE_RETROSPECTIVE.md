# MiMo 登录架构复盘

> **状态：已实现。** 本文记录的架构决策已在 v0.25.0（PR #97）中落地。维护者最终采用方案 B（手动 cookie 导入），实现位于 `src/shared/mimoLimits.js`。

## 目的

本文整理 PR `Javis603/token-monitor#97` 中 MiMo provider 的两种实现思路，以及维护者后来追加 `b4fbab7 refactor(mimo): use manual browser cookies` 的工程原因。

这不是“谁对谁错”的评判，而是把一次真实协作里的架构取舍沉淀为可复用经验，供以后接入其他 `web session` 型 provider 时参考。

## 适用场景

适用于这类 provider：

- 没有稳定、公开、面向账户额度查询的 API key 接口
- 真正可用的数据来自已登录的 web console
- 应用需要读取 quota / balance / billing / token plan 一类账户级信息
- 登录流程由第三方网页掌控，而不是本应用自有的 OAuth / device flow

MiMo 这次就是典型案例。

## 背景

本轮实现里，MiMo 的核心问题不是“能不能请求到接口”，而是“如何获得稳定、可维护、风险边界清晰的登录态”。

PR 早期方案选择：

- 在 Electron 内打开 MiMo 登录页
- 使用隔离 session partition 承载登录态
- 登录完成后从 Electron session 抓取 cookies
- 把 cookies / account / endpoint 信息落盘，再由 provider 读取官方接口

维护者最终追加的方案选择：

- 把登录动作留在系统浏览器
- 引导用户从浏览器 Network 面板复制 `Cookie` request header
- 只保留 MiMo quota 查询所需的最小 cookie allowlist
- 应用内只负责验证 cookie、保存受限凭据、请求固定官方 endpoint

## 两种方案

### 方案 A：内置浏览器登录 + session 抓取

优点：

- 用户路径短，产品体验更顺
- 不需要用户打开 DevTools 或手动复制 cookie
- 理论上可以更接近“一键登录”

代价：

- 应用要自己接管第三方登录流程
- 需要处理 popup / redirect / custom scheme / child window
- 需要管理 Electron session partition 生命周期
- 需要在“临时登录态”与“最终持久化账户”之间做迁移
- 一旦第三方页面行为变化，回归点很多

### 方案 B：系统浏览器登录 + 手动 cookie 导入

优点：

- 认证流程由系统浏览器负责，应用不再承接第三方登录状态机
- 主进程只处理最小化凭据和官方接口请求，职责更单一
- 删除了大量 popup、跳转、session 清理、迁移和窗口编排逻辑
- 出问题时更容易判断责任边界：浏览器登录问题 vs 应用 provider 问题

代价：

- 用户体验比内置登录更重
- 需要人工打开 DevTools、复制并粘贴 Cookie
- 对非技术用户不够友好

## 维护者为什么追加新的 refactor commit

核心原因不是“原方案完全不安全”，而是“原方案把应用放进了第三方认证流程里，导致复杂度和维护成本持续升高”。

维护者在 review 中先认可了原方案的几个边界：

- `contextIsolation` 开启
- `nodeIntegration` 关闭
- cookies 不下发到 renderer
- `accounts.json` 不保存 cookie 值

这说明原方案在基础安全意识上没有走偏。

但他随后指出的几个问题，都直接来自“嵌入式第三方登录”这个架构选择：

1. 登录使用的 `pending-*` partition 与最终账户 partition 不一致，删除账户时可能清不干净真实登录态。
2. legacy migration 的目标目录落在旧目录内部，默认路径下迁移可能失败。
3. 对允许域名的跳转采用“拦截后重开”的策略，可能打断 redirect，或产生额外窗口。
4. 对外部 scheme 的放行过宽，而触发这些 scheme 的页面本身是第三方页面。

这些问题不是某一行代码粗心，而是这类架构天然容易出现的故障模式。

换句话说，维护者新增 commit 的真实意图是：

- 不再继续修补第三方登录窗口状态机
- 直接把“登录”从应用职责里拿掉
- 把应用职责收缩到“消费一个已经完成认证的、最小化的凭据”

这是一种很典型的维护者选择：宁可牺牲一些 UX，也要换取长期可维护性。

## 从软件工程角度看，这次重构解决了什么

### 1. 降低状态机复杂度

内置浏览器方案需要自己维护：

- 主窗口与子窗口
- `window.open`
- `will-navigate`
- `did-navigate`
- `did-finish-load`
- `did-fail-load`
- 登录成功后抓取时机
- 自动关闭 / 恢复显示
- pending account finalize
- session 清理

这些逻辑本质上构成了一个第三方认证状态机。

而系统浏览器 + 手动 cookie 方案把这整块状态机砍掉了，主进程只剩：

- 打开官方控制台
- 接收用户粘贴的 cookie
- 归一化、筛选、验证
- 保存受限凭据
- 拉取余额与 Token Plan

这种结构更稳定，也更容易测试。

### 2. 缩小攻击面

内置浏览器方案里，应用必须处理第三方页面发起的：

- 自定义 scheme
- 新窗口
- 跳转链
- 第三方脚本驱动的导航

即使已经做 allowlist，维护成本仍然很高，因为风险面本身就大。

系统浏览器方案把这些风险留在浏览器环境里，应用不再直接执行第三方登录页面的流程控制。对桌面应用来说，这通常是更保守、更稳妥的边界。

### 3. 减少凭据生命周期问题

内置浏览器方案除了 cookie 内容本身，还要管理：

- session partition
- pending partition
- final partition
- 持久化目录
- 清理 / 搬迁 / 恢复

这意味着“删除账户是否真的删除干净”会变成一类持续风险。

重构后保存的数据虽然仍然敏感，但模型更简单：

- 只保留固定 allowlist cookie
- 只保留 provider 真正请求所需的字段
- 不再维护 Electron 自己的网页登录容器状态

这不是让凭据“完全无风险”，但确实把凭据生命周期缩短、压平了。

### 4. 提高兼容性与回归可控性

第三方登录页的 DOM、跳转、弹窗、校验、App/浏览器联动逻辑都可能变化。

如果应用嵌入它，就必须被动承受这些变化。

如果应用只依赖：

- 一个固定官方 console URL
- 若干个固定 API endpoint
- 一个明确的 request `Cookie` header

那么回归面会小很多。即使 MiMo 页面改版，浏览器登录通常仍能工作；应用只需要确认 cookie 是否还能通过接口验证。

## 安全性到底有没有变高

答案是：有，但要说清楚是“哪一部分”。

变高的部分：

- 应用不再承载第三方登录页面的执行流程
- 不再需要自己处理复杂的导航、弹窗和自定义 scheme
- 不再维护 Electron session container 的登录生命周期
- cookie 被压缩为最小 allowlist，而不是整套网页登录上下文工件

没有本质改变的部分：

- 应用仍然需要保存可用的登录凭据
- 本地一旦失陷，这些凭据仍然属于敏感数据
- “手动粘贴 cookie”并不会神奇地消除 session 风险

所以更准确的表述是：

- 这次重构提升了认证隔离、攻击面控制和维护边界清晰度
- 它不是把敏感凭据问题彻底消灭，而是把问题收敛到了更小、更容易审计的范围

## 为什么维护者会接受更差一些的 UX

因为对维护者来说，以下问题通常比多点两步按钮更昂贵：

- 难以复现的登录跳转 bug
- 删除账户后残留登录态
- 第三方页面变更导致的回归
- 平台差异下的 session / window 行为差异
- 安全审计时很难解释的网页登录控制逻辑

如果一个 provider 没有正式 OAuth / device flow，而你又必须读账户级 web 数据，那么“系统浏览器完成认证，应用只接入最小凭据”往往是长期更便宜的架构。

## 本次案例可复用的判断框架

以后再接类似 provider，可以先问这 6 个问题：

1. 这个 provider 是否有正式、稳定、面向账户额度的 API 或 OAuth？
2. 如果没有，真实数据是不是只能来自已登录 web console？
3. 应用是否真的需要接管第三方登录流程，还是只需要消费登录结果？
4. 是否能把凭据缩减为最小 allowlist，而不是保存完整浏览器状态？
5. 删除账户时，是否能明确、完整地销毁所有登录态与缓存？
6. 如果第三方页面改版，应用是否还能以较小代价继续工作？

如果第 1 题答案是否，第 2 题是，第 3 题能选“只消费结果”，那通常优先考虑：

- 系统浏览器登录
- 手动或半自动导入最小凭据
- 只调用固定官方 endpoint

而不是直接嵌入第三方登录页。

## 一个可复用的设计原则

可以把这次经验抽象成一句话：

> 对第三方 web session 型 provider，应用应尽量消费认证结果，而不是托管认证过程。

更具体一点：

- 如果有正式 auth protocol，优先走正式协议
- 如果没有，优先用系统浏览器完成登录
- 应用只接收最小必要凭据
- 公开接口与 renderer 永远不要直接接触原始凭据
- provider 实现尽量只关心“凭据校验 + endpoint 归一化”

## 对后续开发的直接建议

### 适合继续复用的部分

- `web session provider` 作为单独 provider 类型处理
- 公开 stats 输出与私有 ingest 输出分层
- renderer 与主进程之间保持凭据隔离
- 对 cookie / token / account identity 做最小暴露
- 对 provider 状态使用统一语义：`notConfigured`、`unauthorized`、`sourceRateLimited`、`unavailable`、`ok`

### 不建议复用的部分

- 为第三方网页登录流程编排复杂 Electron 窗口状态机
- 依赖拦截导航再重开的方式控制允许域名
- 同时维护 pending session、final session、迁移目录和自动清理链路
- 在没有正式协议的前提下追求“一键登录”的完整产品体验

### 如果以后还想做“更顺的登录体验”

可以考虑的方向是：

- 浏览器扩展辅助导出最小 cookie
- 更清晰的复制引导与错误提示
- 自动检测 cookie 缺失字段并提示重取
- 在不接管第三方登录流程的前提下做半自动导入

而不是重新把第三方登录页塞回 Electron。

## 和现有 MiMo 文档的关系

本文补充的是“架构取舍与经验沉淀”。

若要看 MiMo 的真实数据来源、目录与 endpoint，请先读：

- [MIMO_CLOUD_DISCOVERY.md](MIMO_CLOUD_DISCOVERY.md)
- [LIMIT_PROVIDERS_AUDIT.md](../audit/LIMIT_PROVIDERS_AUDIT.md)

若要看本项目公开 / 私有 limits 边界，请读：

- [DATA_FLOW.md](../DATA_FLOW.md)
- [CONFIG_AND_STORAGE.md](../CONFIG_AND_STORAGE.md)

## Source

- PR: `Javis603/token-monitor#97`
- Maintainer review on 2026-07-10
- Maintainer follow-up commit on 2026-07-11: `b4fbab7 refactor(mimo): use manual browser cookies`
- 本地审阅分支：`feat/mimo-account`
- 本地实现关注文件：
  - `src/electron/main.js`
  - `src/electron/preload.js`
  - `src/electron/renderer/app.js`
  - `src/shared/mimoLimits.js`
