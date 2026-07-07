# 开发基线

## 本次审计基线

- 基线提交：`98c37a0`
- 审计时工作区状态：先前为干净状态，后续只新增了 `docs/` 下的文档文件

## 环境信息

- Node.js：`v22.22.3`
- npm：`10.9.8`

## 安装结果

`npm install` 已执行并成功。

说明：初次安装时，默认 `~/.npm` 缓存目录里有 root-owned 文件，导致需要切换缓存位置。最后使用了一个临时缓存目录完成安装，且没有修改业务代码。

## 验证结果

`npm run verify` 已执行并通过。

结果摘要：

- `npm run lint` 通过
- `node --test "tests/**/*.test.js"` 通过
- 总计 942 个测试，942 个通过，0 个失败

## 本轮复核

- 2026-07-07 复核：本机的 `tokscale` 已确认接受 `--client micode`，并且当前环境存在 `~/.local/share/mimocode/mimocode.db`。
- 2026-07-07 复核：MiMo Code 本地监控保持 opt-in，不纳入 `DEFAULT_CLIENTS`，以免默认扫描范围扩大并触发 Claude import 重复计数风险。
- 2026-07-07 复核：已只读确认 MiMo Cloud 真实数据来源存在于 `~/Library/Application Support/MiMoMonitor/`（`cookies.json` / `accounts.json` / `endpoints.json` / `config.json` / `balance_snapshot.json`），并且 `endpoints.json` 已包含 `userProfile`、`tokenPlan/usage`、`usage/token-plan/list`、`tokenPlan/detail`、`tokenPlan/list`、`usage/detail/list`、`balance` 等 path。
- 2026-07-07 复核：`~/.local/share/mimocode/mimocode.db` 的 `account` / `account_state` / `control_account` 表结构存在，但当前均为 0 行；本轮只做了只读探测与文档整理，未修改 `src/`。
- 2026-07-07 复核：本轮未运行 `npm run verify`，因为没有改动功能代码。

## 可运行情况

当前基线下，项目的静态检查和测试都处于可通过状态。就审计范围内的代码来说，没有发现需要先修复才能继续做文档整理的问题。

## 已知问题 / 注意事项

1. 本机 `~/.npm` 缓存权限曾经影响安装。
2. 依赖某些外部账号的 provider，仍然需要真实凭据和实际环境才能验证。
3. CI 之外的 live 集成（例如实际 limit provider 登录）不在本次 `verify` 的覆盖范围内。
