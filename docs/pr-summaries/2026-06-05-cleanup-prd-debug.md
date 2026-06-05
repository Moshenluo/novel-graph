# PR 汇总：清理旧图谱遗留并补齐 PRD 调试能力

## 标题

清理旧版图谱遗留文件，补齐产品文档并新增转换诊断。

## 功能描述

本 PR 继续围绕“小说转剧本 YAML”核心方向做收敛，删除旧版小说智能图谱时期遗留的规划文档、测试入口和未使用图标资产，避免评审误以为项目主题仍是通用关系图谱工具。

同时补齐 README 中引用的 PRD、产品思路、UI 迭代计划和评分对齐文档，并在 YAML 导出页新增“转换诊断”模块，用于快速查看章节、人物、场景、对白和 YAML 生成状态。

## 实现思路

1. 删除 `design.md`、`changelog.md`、`test.html`、`src/test.tsx` 和未引用的 Vite/React 默认图标。
2. 卸载当前核心流程未使用的旧图谱依赖：`@xyflow/react`、`html2canvas`、`openai`、`pdfjs-dist`、`uuid`、`zustand`。
3. 新增 `.env.example`，让 DeepSeek API 配置路径与 README 保持一致。
4. 补齐 `docs/product-thinking.md`、`docs/prd.md`、`docs/design-iteration-plan.md`、`docs/scoring-alignment.md`，支撑评审理解产品路线。
5. 在导出页增加转换诊断列表，帮助演示和调试 YAML 结构完整度。

## 测试方式

1. 执行 `npm run lint`，确认清理后没有未使用引用或 ESLint 错误。
2. 执行 `npm run build`，确认依赖收敛后生产构建仍可通过。
3. 打开本地开发页面，进入 YAML 导出步骤，确认转换诊断模块展示章节、人物、场景、对白和 YAML 状态。
4. 检查 README 中的文档链接，确认对应文件均已存在。
