# PR 汇总：新增场景调度与潜台词层

## 标题

新增场景调度、人物动作和潜台词 YAML 层。

## 功能描述

本 PR 将“建议补充镜头调度、人物动作和潜台词”升级为产品能力。生成 YAML 时，每个场景新增 `staging` 字段，包含：

- `camera`：镜头或舞台调度建议。
- `action`：人物可表演动作。
- `subtext`：对白或沉默背后的潜台词提示。

AI 模式会尝试生成这三类内容；本地模式会提供可编辑占位，让作者仍能按同一 Schema 继续打磨。

## 实现思路

1. 扩展 `AISceneEnrichment`，新增 `camera_direction`、`character_action`、`subtext_cue`。
2. 扩展 AI 场景分析 prompt，要求返回调度、动作和潜台词。
3. 在 AI 降级路径补齐调度层默认值。
4. 在本地与 AI YAML 中写入 `staging.camera`、`staging.action`、`staging.subtext`。
5. YAML 质量检查和作者审稿清单新增调度层检查。
6. 同步 README、PRD、YAML Schema 和产品迭代思路文档。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 输入 3 章文本生成 YAML，确认每个场景包含 `staging`。
4. AI 模式下确认 prompt 可返回调度、动作和潜台词；失败时仍能降级生成 YAML。
