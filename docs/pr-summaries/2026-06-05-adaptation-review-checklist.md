# PR 汇总：新增作者审稿清单

## 标题

新增作者审稿清单并写入剧本 YAML。

## 功能描述

本 PR 围绕“可编辑、可进一步打磨的剧本初稿”继续完善核心流程。导出页新增“作者审稿清单”，根据章节、人物、对白、AI 推理依据和低置信度风险提示作者下一步该核查什么。

生成的 YAML 也会新增 `review_checklist` 字段，让作者下载后仍能按清单继续修改，而不是只拿到一份静态初稿。

## 实现思路

1. 新增 `ReviewChecklistItem` 类型和 `adaptationReviewChecklist` 计算逻辑。
2. 在导出页右侧面板渲染审稿清单，区分 `passed`、`review`、`todo` 状态。
3. 在本地生成和 AI 增强生成的 YAML 中写入 `review_checklist`。
4. 将 YAML 质量检查扩展为检查 `review_checklist` 是否存在。
5. 同步 README、PRD 和 YAML Schema 文档。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 输入 3 章文本生成 YAML，确认导出页显示“作者审稿清单”。
4. 确认 YAML 包含 `review_checklist`，并包含章节、人物、对白或 AI 依据相关审稿项。
