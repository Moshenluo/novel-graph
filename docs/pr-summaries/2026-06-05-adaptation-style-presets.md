# PR 汇总：新增改编风格预设

## 标题

新增改编风格预设并驱动 AI YAML 输出。

## 功能描述

本 PR 在“改编目标”基础上继续增加“改编风格”选择。用户可选择现实主义、悬疑惊悚、轻喜剧或古风权谋。风格会写入 YAML 的 `project.adaptation_style`、`tone` 和 `dialogue_style`，并进入 AI 场景分析 prompt。

这样同一份小说不仅可以选择短片、短剧或舞台剧，还可以选择不同表达语气，让 YAML 初稿更贴近作者想要的改编方向。

## 实现思路

1. 新增 `AdaptationStyle` 类型和四组风格预设。
2. 在文本导入页新增改编风格选择器。
3. 在侧栏状态中显示当前改编风格。
4. 在本地与 AI YAML 中写入风格元数据。
5. 将 AI 场景分析 prompt 扩展为读取风格语气、对白指南和节拍指南。
6. 同步 README、PRD 和 YAML Schema 文档。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 切换不同改编风格后生成 YAML，确认 `adaptation_style`、`tone`、`dialogue_style` 随选择变化。
4. AI 模式下确认 prompt 能继续完成场景分析，失败时仍能降级生成 YAML。
