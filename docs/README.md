# 文档索引

> 当前基线：`upstream/main`（`9946b13`，package version `0.29.0`），2026-07-16 更新。

这些文档基于审计结果整理，目标是给后续二次开发提供一套稳定的"先读什么、再改什么"的入口。

建议阅读顺序：

1. [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - 项目定位、核心能力、运行形态。
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Electron、renderer、shared、hub、worker、agent 的关系。
3. [DATA_FLOW.md](DATA_FLOW.md) - usage、cost、limits、history、sync 的数据流和隐私边界。
4. [audit/LOCAL_CLIENTS_AUDIT.md](audit/LOCAL_CLIENTS_AUDIT.md) - 当前支持的本地 client。
5. [audit/LIMIT_PROVIDERS_AUDIT.md](audit/LIMIT_PROVIDERS_AUDIT.md) - 当前支持的云端 limit provider（17 个，含 MiMo 多账号和 Ollama Cloud）。
6. [providers/MIMO_CLOUD_DISCOVERY.md](providers/MIMO_CLOUD_DISCOVERY.md) - MiMo Cloud 早期探测记录（已实现，保留作参考）。
7. [providers/MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md](providers/MIMO_LOGIN_ARCHITECTURE_RETROSPECTIVE.md) - MiMo 登录方案复盘、维护者重构动机与可复用工程经验。
8. [UI_STRUCTURE.md](UI_STRUCTURE.md) - 当前 renderer UI 结构与视图。
9. [CONFIG_AND_STORAGE.md](CONFIG_AND_STORAGE.md) - 配置、存储、账号凭据与数据出站边界。
10. [audit/DEVELOPMENT_BASELINE.md](audit/DEVELOPMENT_BASELINE.md) - 审计基线与验证结果。
11. [guides/CUSTOMIZATION_PLAN.md](guides/CUSTOMIZATION_PLAN.md) - 面向后续定制开发的建议路径。

已有的项目级文档：

- [API.md](API.md) - hub API 协议说明。
- [guides/export.md](guides/export.md) - 数据导出格式与使用方式。
- [guides/hermes-wsl-setup.md](guides/hermes-wsl-setup.md) - Hermes / WSL 场景的部署说明。
- [guides/github-copilot-otel.md](guides/github-copilot-otel.md) - GitHub Copilot OpenTelemetry 集成说明。

如果你只想快速判断"这个项目是什么、能改哪里、不能乱动哪里"，先看前 4 份文档即可。
