# 最终提交核对表

提交前按本清单逐项确认，避免因为仓库状态、视频链接或密钥问题影响评审。

## 题目要求

- [ ] 仓库可公开访问。
- [ ] README 明确项目对应“题目三：AI 小说转剧本工具”。
- [ ] 支持输入 3 个章节以上小说文本。
- [ ] 少于 3 章时会阻止继续生成。
- [ ] 能输出结构化剧本 YAML。
- [ ] YAML 输出可直接编辑。
- [ ] YAML 片段可选中后用 AI 精修。
- [ ] [screenplay-yaml-schema.md](screenplay-yaml-schema.md) 已定义 Schema 并说明设计原因。

## 功能演示

- [ ] 演示文档导入。
- [ ] 演示直接复制粘贴。
- [ ] 演示章节确认和 AI 章节校对。
- [ ] 演示剧本草案。
- [ ] 演示人物共现线索作为辅助检查。
- [ ] 演示 YAML 生成、复制和下载。
- [ ] 演示 YAML 质量检查面板。
- [ ] 演示 Schema 文档入口。

## Demo 视频

- [ ] 按 [demo-script.md](demo-script.md) 录制有声音讲解的视频。
- [ ] 视频上传到 bilibili、网盘或其他可公开访问平台。
- [ ] 视频链接可以无登录播放或至少评委可访问。
- [ ] README 的 Demo 视频链接已替换为真实链接。

## 开发过程

- [ ] PR 标题和描述完整。
- [ ] PR 描述包含功能描述、实现思路和测试方式。
- [ ] 每个 PR 只做一件事。
- [ ] `docs/pr-summaries/` 已记录阶段性 PR 汇总。
- [ ] 旧图谱根目录文件已通过直连 main 的 PR 删除。

## 安全与依赖

- [ ] `.env` 没有提交。
- [ ] README 没有真实 API Key。
- [ ] 运行敏感信息扫描：
  ```bash
  rg -n "sk-bab|VITE_DEEPSEEK_API_KEY=.*sk-|API 配置|localStorage|本地候选" src README.md docs .env.example package.json package-lock.json
  ```
- [ ] README 已列明 React、TypeScript、Vite、mammoth 和 DeepSeek API。
- [ ] 未使用的旧图谱公共资源不在默认分支。

## 构建验证

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] 本地页面可访问：
  ```bash
  Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173
  ```
