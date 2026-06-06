# PR 汇总：增强对白识别与 AI 建议对白补全

## 标题

增强对白识别规则，并将 AI 建议对白写入可审核草案。

## 功能描述

本 PR 优化小说转剧本过程中的对白处理。规则层不再只依赖单一“某人说道：引号内容”格式，而是同时识别：

1. 说话人 + 说话动词 + 冒号/引号，例如“孔乙己说道：‘窃书不能算偷。’”。
2. 说话人 + 冒号，例如“孔乙己：窃书不能算偷。”。
3. 引号对白 + 说话人 + 说话动词，例如“‘窃书不能算偷。’孔乙己说道。”

AI 模式下，如果原文没有识别出明确对白，则把 `suggested_dialogue` 转成 `dialogue` 草案，并标记 `speaker: 待定`、`source: ai_suggested`，提醒作者后续手动确认说话人、语气和原文依据。

## 实现思路

1. 扩展 `DialogueLine`，增加 `source` 字段区分 `source_detected` 与 `ai_suggested`。
2. 重写 `extractQuotedDialogue`，支持冒号、中文/英文引号和说话动词组合，并对重复对白去重。
3. 新增 `mergeDialogueDrafts`，优先使用原文识别对白；若没有识别结果，则接入 AI 建议对白。
4. AI 生成 YAML 时输出 `dialogue[].source`，并为 AI 建议对白写入审核提示。
5. README、PRD 和 YAML Schema 同步说明“规则识别 + AI 辅助 + 作者手动补充”的对白流程。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 用包含冒号对白和引号对白的文本生成草案，确认对白数量增加。
4. AI 模式下生成 YAML，确认无原文对白时 `suggested_dialogue` 会进入 `dialogue` 并标记 `source: ai_suggested`。
5. 检查 `origin/main..HEAD`，确认旧根目录文件 `changelog.md`、`design.md`、`test.html` 与旧公共样例仍处于删除状态。
