# PR 汇总：优化 YAML 导出工具栏间距

## 标题

优化 YAML 导出页按钮与预览框间距。

## 功能描述

本 PR 修复 YAML 导出页顶部“复制/下载”按钮与预览容器靠得太紧的问题。调整后，导出标题、按钮组和 YAML 预览框之间有稳定间距，窄屏下按钮组会自动换行。

## 实现思路

1. 将导出页顶部内联样式替换为 `yaml-export-head`、`yaml-export-actions`、`yaml-action`。
2. 复用并增强已有 `yaml-preview` 样式，统一预览框高度、间距和排版。
3. 增加移动端换行规则，避免按钮贴近预览框。

## 测试方式

1. 运行 `npm run lint` 检查代码规范。
2. 运行 `npm run build` 检查 TypeScript 与生产构建。
3. 打开 YAML 导出页，确认复制/下载按钮与 YAML 预览框不再贴得过近。
