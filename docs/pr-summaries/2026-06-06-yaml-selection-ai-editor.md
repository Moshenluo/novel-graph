# PR 汇总：新增 YAML 选区 AI 精修

## 标题

新增 YAML 直接编辑与选区 AI 精修能力。

## 功能描述

本 PR 将 YAML 导出区从只读预览升级为可编辑工作区。作者可以直接修改生成后的 YAML，也可以选中某个片段，输入修改要求后让 AI 只精修选中的 YAML 片段。

这解决“生成后仍不能修改 YAML”的问题，也让工具从一次性生成器更接近剧本打磨工作台。

## 实现思路

1. 将 YAML 预览从 `<pre>` 改为可编辑 `<textarea>`。
2. 通过 `selectionStart` / `selectionEnd` 记录作者选中的 YAML 片段。
3. 新增 `aiRefineYamlFragment`，要求 AI 只返回修改后的 YAML 片段。
4. 将 AI 返回内容替换回原 YAML 的选区，未选中的上下文保持不变。
5. 补充 Schema 说明，明确 Schema 是生成、编辑、AI 精修和评审检查共同遵守的结构标准。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 生成 YAML 后直接编辑文本，确认质量检查会基于编辑后的 YAML 更新。
4. 配置 API 后选中某个场景片段，输入修改要求，确认 AI 只替换选中片段。
