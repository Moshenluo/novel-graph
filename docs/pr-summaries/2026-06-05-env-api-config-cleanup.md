# PR 汇总：撤销页面 API 面板并回归本地 env 配置

## 标题

撤销侧栏 AI 配置面板，使用 `.env` 管理 DeepSeek API Key。

## 功能描述

本 PR 根据最新 UI 收敛要求，移除侧栏“AI 配置”面板，避免核心创作流程被配置表单打断。DeepSeek API Key 改为仅通过项目根目录 `.env` 读取，页面只展示 AI 是否已启用。

## 实现思路

1. 删除浏览器 `localStorage` API Key 读取、保存和清除逻辑。
2. DeepSeek 调用层回归 `VITE_DEEPSEEK_API_KEY` 与 `VITE_DEEPSEEK_BASE_URL`。
3. 侧栏删除配置输入框，仅保留“已启用 / 未配置”的状态说明。
4. README 更新为 `.env` 配置路径，并强调真实 API Key 不应进入代码或提交记录。
5. 本地创建 `.env` 供演示使用，`.gitignore` 会阻止其被提交。

## 测试方式

1. 在项目根目录创建 `.env` 并写入 `VITE_DEEPSEEK_API_KEY`。
2. 重启 `npm run dev`，确认左侧 AI 状态变为已启用。
3. 执行 `npm run lint`，确认没有未使用状态或事件处理函数。
4. 执行 `npm run build`，确认生产构建通过。
5. 检查 `git status`，确认 `.env` 没有进入暂存区或提交。
