# PR 汇总：扩展改编目标与风格预设

## 标题

扩展改编目标与改编风格预设，并新增保持原文选项。

## 功能描述

本 PR 回应“改编目标和风格偏少”的问题。改编目标从 3 个扩展到 6 个：影视短片、电影长片、短剧分集、单集电视剧、舞台剧、有声剧。

改编风格从 4 个扩展到 8 个，并新增默认的“保持原文”选项：保持原文、现实主义、悬疑惊悚、轻喜剧、古风权谋、情感爱情、科幻设定、奇幻史诗。

当用户选择“保持原文”时，AI prompt 不会强行套用类型风格，而是优先保留原文气质、人物语气和叙事重心。YAML 中新增 `style_policy`，用于区分 `preserve_source` 与 `style_guided`。

## 实现思路

1. 扩展 `AdaptationTargetId` 与 `ADAPTATION_TARGETS`。
2. 扩展 `AdaptationStyleId` 与 `ADAPTATION_STYLES`。
3. 为风格预设增加 `preserveSource` 标记。
4. 在 AI 场景分析 prompt 中对“保持原文”做独立约束。
5. 在 YAML 中输出 `style_policy`。
6. 压缩目标与风格选择器样式，避免选项增多后 UI 臃肿。
7. 同步 README、PRD 和 YAML Schema 文档。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 切换新增目标和风格生成 YAML，确认 `target_format`、`adaptation_style`、`style_policy` 随选择变化。
4. 选择“保持原文”，确认 YAML 输出 `style_policy: "preserve_source"`。
