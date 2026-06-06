# PR 汇总：新增改编目标预设

## 标题

新增影视短片、短剧分集、舞台剧改编目标预设。

## 功能描述

本 PR 让“小说转剧本 YAML”不再只是通用转换，而是先选择改编目标。用户可以在文本导入阶段选择影视短片、短剧分集或舞台剧，工具会把目标写入 YAML 的 `project.target_format`、`structure_focus` 和 `pacing`。

AI 增强模式下，场景分析提示词也会读取当前改编目标，让摘要、冲突、节拍和建议对白更贴合目标媒介。

## 实现思路

1. 新增 `AdaptationTarget` 类型和三组预设配置。
2. 在文本导入页新增改编目标选择器。
3. 在侧栏状态中显示当前改编目标。
4. 在本地和 AI YAML 生成中写入目标化项目元数据。
5. 将 AI 场景分析 prompt 扩展为按当前改编目标输出。
6. 同步 README、PRD 和 YAML Schema 文档。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 切换不同改编目标后生成 YAML，确认 `target_format`、`structure_focus`、`pacing` 随选择变化。
4. AI 模式下确认场景分析仍能完成，失败时仍能降级生成 YAML。
