# 文档索引

这些文档基于本次审计结果整理，目标是给后续二次开发提供一套稳定的“先读什么、再改什么”的入口。

建议阅读顺序：

1. [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - 项目定位、核心能力、运行形态。
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Electron、renderer、shared、hub、worker、agent 的关系。
3. [DATA_FLOW.md](DATA_FLOW.md) - usage、cost、limits、history、sync 的数据流和隐私边界。
4. [LOCAL_CLIENTS_AUDIT.md](LOCAL_CLIENTS_AUDIT.md) - 当前支持的本地 client。
5. [LIMIT_PROVIDERS_AUDIT.md](LIMIT_PROVIDERS_AUDIT.md) - 当前支持的云端 limit provider。
6. [MIMO_CLOUD_DISCOVERY.md](MIMO_CLOUD_DISCOVERY.md) - MiMo Cloud 登录态、endpoint 和接入前置探测结果。
7. [UI_STRUCTURE.md](UI_STRUCTURE.md) - 当前 renderer UI 结构与视图。
8. [CONFIG_AND_STORAGE.md](CONFIG_AND_STORAGE.md) - 配置、存储、账号凭据与数据出站边界。
9. [DEVELOPMENT_BASELINE.md](DEVELOPMENT_BASELINE.md) - 本次审计的基线与验证结果。
10. [CUSTOMIZATION_PLAN.md](CUSTOMIZATION_PLAN.md) - 面向后续定制开发的建议路径。

已有的项目级文档：

- [API.md](API.md) - hub API 协议说明。
- [export.md](export.md) - 数据导出格式与使用方式。
- [hermes-wsl-setup.md](hermes-wsl-setup.md) - Hermes / WSL 场景的部署说明。

如果你只想快速判断“这个项目是什么、能改哪里、不能乱动哪里”，先看前 4 份文档即可。
