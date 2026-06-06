# AI 小说转剧本工具

本项目面向“题目三：AI 小说转剧本工具”。产品不采用黑箱式一键直转，而是通过“文本导入 -> 章节确认 -> 剧本草案 -> YAML 导出”的分步工作流，帮助作者逐步把 3 个章节以上小说文本整理成可编辑、可继续打磨的剧本 YAML 初稿。

## 主题功能

- 小说章节识别：支持“第一章”“第二章”“Chapter 1”“1. 标题”等常见章节标题。
- 剧本 YAML 生成：自动输出 `project`、`characters`、`scenes`、`beats`、`dialogue`、`adaptation_notes`。
- 章节数量校验：少于 3 个章节时阻止生成，满足题目最低要求。
- 可编辑工作流：输入区、YAML 输出区、复制按钮、下载按钮均在前端完成。
- 默认首页即为分步创作工作台，评审打开即可复现完整流程。
- 支持文档导入和直接复制粘贴两种输入方式。

## 辅助能力

- 人物共现图谱：在“剧本草案”阶段展示人名候选和同章出现线索，辅助检查角色是否遗漏。

界面默认隐藏其他实验性模块，避免分散“小说转剧本 YAML”的核心任务。

## 快速开始

```bash
npm install
npm run dev
```

默认开发地址通常为：

```text
http://localhost:5173
```

构建生产版本：

```bash
npm run build
npm run preview
```

最终提交前建议执行：

```bash
npm run check
```

## 使用方式

1. 打开项目后默认进入“文本导入”步骤。
2. 通过“上传文档”导入 `.txt`、`.md`、`.docx`，或直接粘贴至少 3 个章节的小说文本。
3. 进入“章节确认”，检查系统识别到的章节标题、摘要和字数。
4. 进入“剧本草案”，查看场景摘要、动作节拍、对白数量和人物共现线索。
5. 进入“YAML 导出”，生成、复制或下载 `.yaml` 文件。

输入区默认空白，便于评审使用自己的小说章节文本或文档进行演示。

## YAML Schema

剧本 YAML Schema 的完整定义与设计原因见：

[docs/screenplay-yaml-schema.md](docs/screenplay-yaml-schema.md)

产品需求与 UI 迭代计划：

- [docs/product-thinking.md](docs/product-thinking.md)
- [docs/prd.md](docs/prd.md)
- [docs/design-iteration-plan.md](docs/design-iteration-plan.md)
- [docs/scoring-alignment.md](docs/scoring-alignment.md)
- [docs/final-requirements-audit.md](docs/final-requirements-audit.md)

Schema 设计原则：

- 以场景为剧本主体，符合编剧和后续拍摄排练工作流。
- 保留 `source_chapter`，保证从小说章节到剧本场景的可追溯性。
- 使用稳定 `id`，方便后续版本管理、人物图谱联动和 PR 审阅。
- 保留 `revision_notes`，明确自动转换结果是可打磨初稿。

## Demo 视频

Demo 视频链接：

```text
TODO: 提交前上传到 bilibili、网盘或其他可公开访问平台，并将链接替换到这里。
```

建议视频覆盖：

- 导入或粘贴 3 章以上小说文本。
- 展示章节确认和剧本草案。
- 生成 YAML 剧本并复制/下载。
- 展示复制/下载结果。
- 简要展示人物共现线索如何辅助检查角色候选。

## 依赖说明

主要依赖：

- React：前端界面框架。
- TypeScript：类型约束与构建检查。
- Vite：开发服务器与前端构建。
- @xyflow/react：人物关系图谱画布。
- html2canvas：导出图谱截图。
- mammoth、pdfjs-dist：预留文档解析相关能力。
- uuid、zustand：预留数据状态与标识能力。

原创功能部分：

- 小说章节解析与 3 章输入校验。
- 小说文本到剧本 YAML 的启发式转换逻辑。
- 剧本转换工作台 UI。
- 剧本 YAML Schema 文档和设计说明。
- 人物共现图谱与剧本打磨流程的整合。

## 可选 AI 配置

主题功能“剧本 YAML 转换”和人物共现图谱均在浏览器本地运行，不调用外部接口，不需要配置 API Key。图谱连线表示同章出现线索，不等同于人工确认的角色设定。

## PR 与提交规范

本项目按竞赛要求建议持续提交小粒度 PR。每个 PR 只做一件事，描述需包含：

- 标题：一句话说明新增或修改内容。
- 功能描述：功能作用与使用方式。
- 实现思路：核心逻辑、技术选型或数据结构。
- 测试方式：如何验证功能正常运行。

示例 PR 拆分：

- `feat: 新增小说章节解析与剧本 YAML 生成`
- `docs: 补充剧本 YAML Schema 设计说明`
- `docs: 更新 README 运行方式与 Demo 链接`

## 学术诚信与知识产权

本仓库应保持自主完成，不复制他人作品。若复用历史代码片段或第三方模板，需要在 PR 描述中说明来源。第三方依赖已在“依赖说明”中列出。
