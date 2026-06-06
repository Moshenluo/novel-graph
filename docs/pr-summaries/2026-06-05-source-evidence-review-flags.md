# PR 汇总：新增原文依据与审核标记

## 标题

新增 AI 推理的原文依据、置信度与作者审核标记。

## 功能描述

本 PR 聚焦“小说转剧本 YAML”输出可信度。AI 增强模式下，人物表会输出识别置信度，场景 `ai_inference` 会输出支持判断的原文摘录 `source_excerpt`、推理置信度 `confidence` 和 `needs_author_review`。

作者拿到 YAML 后，可以优先检查低置信度内容，也能根据摘录回到小说原文核对 AI 是否理解正确。

## 实现思路

1. 扩展 AI 人物提取提示词，要求返回 `confidence`。
2. 扩展 AI 场景分析提示词，要求返回 `source_excerpt` 与 `confidence`。
3. 在本地降级路径中补齐低置信度默认值，避免字段缺失。
4. 在 YAML 导出中把依据与置信度写入人物表和 `ai_inference`。
5. 在 YAML 质量检查中增加“原文依据”检查项。
6. 同步 README、PRD 和 YAML Schema 文档。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 用 3 章以上文本生成 YAML，确认 AI 模式下包含 `source_excerpt`、`confidence` 和 `needs_author_review`。
4. 确认未配置或 AI 降级时仍能生成可编辑 YAML 初稿。
