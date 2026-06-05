# AI 小说转剧本工具

本项目面向"题目三：AI 小说转剧本工具"。产品不采用黑箱式一键直转，而是通过"文本导入 -> 章节确认 -> 剧本草案 -> YAML 导出"的分步工作流，帮助作者逐步把 3 个章节以上小说文本整理成可编辑、可继续打磨的剧本 YAML 初稿。

## 主题功能

- 小说章节识别：支持"第一章""第二章""Chapter 1""1. 标题"等常见章节标题。
- 章节就绪检查：在生成前提示章节长度、句子数量、对白线索和待关注项。
- 剧本 YAML 生成：自动输出 `project`、`characters`、`scenes`、`beats`、`dialogue`、`adaptation_notes`。
- 章节数量校验：少于 3 个章节时阻止生成，满足题目最低要求。
- 转换诊断：在导出阶段展示章节、人物、场景、对白和 YAML 生成状态，便于调试与演示。
- AI 生成进度：AI 模式下逐章分析场景，展示 AI 成功场景数与降级场景数。
- YAML 质量检查：导出阶段检查 Schema 版本、人物表、场景、节拍、对白和打磨说明是否齐备。
- 可编辑工作流：输入区、YAML 输出区、复制按钮、下载按钮均在前端完成。
- 默认首页即为分步创作工作台，评审打开即可复现完整流程。
- 工作台 UI 重构：采用深色流程侧栏、纸面主工作区和顶部结构指标，主流程优先，辅助检查面板降噪。
- 支持文档导入和直接复制粘贴两种输入方式。

## 辅助能力

- 人物共现图谱：在"剧本草案"阶段展示人名候选和同章出现线索，辅助检查角色是否遗漏。
- 人物覆盖统计：展示全部候选人物的出现次数、覆盖章节和主要共现组合。
- AI 增强人物识别：配置 DeepSeek API Key 后，自动识别非标准角色名称（如"狂人""孔乙己""阿Q"等），大幅提升人物候选准确度。
- AI 场景丰富：AI 模式下生成剧本时，每个场景的摘要、节拍、时间地点均由 AI 分析后写入 YAML。
- AI 推理补全：AI 模式下补充人物动机、人物弧光、场景冲突、戏剧目的和建议对白，并标记为需作者审核。

## 可选 AI 配置

本项目默认在浏览器本地运行，不需要任何外部依赖即可生成 YAML 剧本。

**使用 `.env` 配置，适合本地演示与稳定运行**

1. 复制 `.env.example` 为 `.env`：
   ```bash
   cp .env.example .env
   ```
2. 在 `.env` 中填入你的 [DeepSeek API Key](https://platform.deepseek.com/)：
   ```env
   VITE_DEEPSEEK_API_KEY=sk-your-key-here
   ```
3. 重启开发服务器，界面自动识别并显示 "🔮 AI 已启用"。

如果页面仍显示"未配置"，通常是 `.env` 没有放在项目根目录，或修改 `.env` 后没有重启 `npm run dev`。Vite 只会在启动时读取 `VITE_` 开头的环境变量。

安全说明：不要把真实 API Key 写入代码、README 或提交记录。`.env` 已被 `.gitignore` 忽略，适合保存本地演示 Key。

AI 增强功能：
- **人物提取**：识别"狂人""赵太爷""掌柜"等非标准中文姓名和称呼
- **场景丰富**：AI 分析每个章节，生成更准确的场景摘要和动作节拍
- 未配置 API Key 时自动降级为本地正则解析，不影响核心功能

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

## 使用方式

1. 打开项目后默认进入"文本导入"步骤。
2. 选择改编目标：影视短片、短剧分集或舞台剧。
3. 通过"上传文档"导入 `.txt`、`.md`、`.docx`，或直接粘贴至少 3 个章节的小说文本。
4. 进入"章节确认"，检查系统识别到的章节标题、摘要和字数。
5. 进入"剧本草案"，查看场景摘要、动作节拍、对白数量和人物共现线索。
6. 进入"YAML 导出"，生成、复制或下载 `.yaml` 文件。

输入区默认空白，便于评审使用自己的小说章节文本或文档进行演示。

## YAML Schema

剧本 YAML Schema 的完整定义与设计原因见：

[docs/screenplay-yaml-schema.md](docs/screenplay-yaml-schema.md)

产品需求与 UI 迭代计划：

- [docs/product-thinking.md](docs/product-thinking.md)
- [docs/prd.md](docs/prd.md)
- [docs/design-iteration-plan.md](docs/design-iteration-plan.md)
- [docs/scoring-alignment.md](docs/scoring-alignment.md)
- [docs/pr-summaries/](docs/pr-summaries/)

Schema 设计原则：

- 以场景为剧本主体，符合编剧和后续拍摄排练工作流。
- 保留 `source_chapter`，保证从小说章节到剧本场景的可追溯性。
- 使用稳定 `id`，方便后续版本管理、人物图谱联动和 PR 审阅。
- AI 增强结果保留 `source_excerpt`、`confidence` 和 `needs_author_review`，方便作者区分原文依据与改编推理。
- 保留 `target_format`、`structure_focus` 和 `pacing`，让 YAML 明确当前改编目标。
- 输出 `review_checklist`，把自动初稿后的作者审稿事项写进 YAML。
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
- mammoth：读取 `.docx` 文档并提取纯文本。
- DeepSeek Chat Completions API：可选 AI 增强能力，通过浏览器 `fetch` 调用；未配置时自动降级为本地启发式转换。

原创功能部分：

- 小说章节解析与 3 章输入校验。
- 小说文本到剧本 YAML 的启发式转换逻辑。
- 剧本转换工作台 UI。
- 剧本 YAML Schema 文档和设计说明。
- 人物共现图谱与剧本打磨流程的整合。
- 转换诊断与 PR 汇总文档。
- AI 推理依据、置信度与作者审核标记。
- 作者审稿清单与 YAML 后续打磨工作流。
- 改编目标预设与目标化 YAML 元数据。

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

本仓库应保持自主完成，不复制他人作品。若复用历史代码片段或第三方模板，需要在 PR 描述中说明来源。第三方依赖已在"依赖说明"中列出。
