# PR 汇总：新增 AI 推理补全 YAML 字段

## 标题

新增 AI 推理字段，补全人物与场景的剧本化信息。

## 功能描述

本 PR 解决 YAML 初稿内容不够完整的问题。AI 模式下，系统会在人物表中补充人物动机、人物弧光和识别依据，并在场景中补充核心冲突、戏剧目的和建议对白。

所有超出原文直述的内容都会标记为 `ai_inferred`，并设置 `needs_author_review: true`，明确提醒作者这些内容是 AI 辅助理解后的改编建议，需要人工审核。

## 实现思路

1. 扩展 AI 人物提取 Prompt，要求返回 `motivation` 和 `arc`。
2. 扩展 AI 场景丰富 Prompt，要求返回 `conflict`、`dramatic_purpose` 和 `suggested_dialogue`。
3. 增强 JSON 解析兜底，模型漏字段时仍能生成可用 YAML。
4. YAML 人物块新增 `arc`、`evidence`、`inference_source`、`needs_author_review`。
5. YAML 场景块新增 `ai_inference`，集中承载 AI 推理内容。
6. Schema 文档同步说明 AI 推理字段的设计原因。

## 测试方式

1. 执行 `npm run lint`，确认没有类型或 lint 错误。
2. 执行 `npm run build`，确认生产构建通过。
3. 配置 `.env` 后生成 YAML，确认人物包含 `motivation`、`arc` 和审核标记。
4. 确认场景包含 `ai_inference.conflict`、`dramatic_purpose` 和 `suggested_dialogue`。
5. 临时让 AI 返回缺字段内容，确认兜底逻辑仍能生成 YAML。
