# PR 汇总：新增 YAML 质量检查与 Schema 快捷入口

## 标题

新增 YAML 输出质量检查，并提供剧本 Schema 快捷入口。

## 功能描述

本 PR 聚焦“小说转剧本 YAML”核心输出质量。生成 YAML 后，导出页会检查 `schema_version`、`characters`、`scenes`、`beats`、`dialogue`、`adaptation_notes` 是否齐备，并显示每项通过或待完善。

同时，导出页右侧提供 YAML Schema 文档入口，方便评审和作者理解当前输出结构与字段设计原因。

## 实现思路

1. 新增 `YamlQualityCheck` 结构，基于当前 YAML 文本做轻量结构检查。
2. 将原来的静态“导出清单”升级为动态质量检查面板。
3. 质量检查不引入额外 YAML 解析依赖，保持前端依赖收敛。
4. 在导出页增加 Schema 文档链接，指向仓库中的 `docs/screenplay-yaml-schema.md`。
5. README 和 UI 迭代计划同步记录该功能。

## 测试方式

1. 执行 `npm run lint`，确认没有类型或 lint 错误。
2. 执行 `npm run build`，确认生产构建通过。
3. 生成 YAML 前查看质量检查，确认各项显示待完善。
4. 生成 YAML 后查看质量检查，确认 Schema、人物、场景、节拍、打磨说明等项目更新为通过。
5. 点击 Schema 链接，确认可跳转到仓库 Schema 文档。
