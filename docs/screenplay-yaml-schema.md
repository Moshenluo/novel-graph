# 剧本 YAML Schema 设计说明

本文档定义"AI 小说转剧本工具"输出的 YAML 结构。Schema 目标不是一次性生成终稿，而是让作者快速获得可编辑、可复用、可版本管理的剧本初稿。

## 顶层结构

```yaml
schema_version: "1.0"
project: {}
characters: []
scenes: []
adaptation_notes: []
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schema_version` | string | 是 | Schema 版本，便于后续兼容升级。 |
| `project` | object | 是 | 项目信息与输入来源摘要。 |
| `characters` | array | 是 | 从小说文本提取或由作者补充的人物表。 |
| `scenes` | array | 是 | 剧本主体，每个元素对应一个可编辑场景。 |
| `adaptation_notes` | array | 否 | 改编建议、自动化限制、后续打磨提醒。 |

## project

```yaml
project:
  title: "小说改编剧本初稿"
  source_type: "novel"
  chapter_count: 3
  logline: "由小说章节自动提炼出的可编辑剧本初稿。"
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 剧本项目名称，默认可由作者修改。 |
| `source_type` | string | 输入来源，目前固定为 `novel`。 |
| `chapter_count` | number | 成功识别的小说章节数。 |
| `logline` | string | 一句话梗概，自动生成阶段可先给占位文案。 |

设计原因：项目元数据放在顶层，便于 README、Demo、导出文件和后续工作流快速展示输入规模与剧本定位。

## characters

```yaml
characters:
  - id: "char_1"
    name: "林秋"
    role: "protagonist"
    motivation: "待作者补充"
    arc: "待作者补充"
    evidence: "待作者核对原文依据"
    confidence: "medium"
    inference_source: "ai_inferred"
    needs_author_review: true
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定人物标识，供场景、对白、关系图引用。 |
| `name` | string | 人物姓名。 |
| `role` | string | 人物功能，如 `protagonist`、`supporting`、`antagonist`。 |
| `motivation` | string | 人物动机，自动稿可先保留待补充项。 |
| `arc` | string | 人物弧光，AI 模式下可给出改编推理。 |
| `evidence` | string | 角色识别或推理依据，便于作者核对原文。 |
| `confidence` | string | 角色识别和推理置信度，取值为 `low`、`medium`、`high`。 |
| `inference_source` | string | 推理来源，如 `ai_inferred`。 |
| `needs_author_review` | boolean | 是否需要作者审核，AI 推理字段应为 `true`。 |

设计原因：剧本创作需要持续追踪人物动机和功能。单独人物表可以避免每个场景重复描述角色，也方便未来与现有"小说智能图谱"的人物节点联动。

## scenes

```yaml
scenes:
  - id: "scene_01"
    source_chapter: 1
    title: "雨夜来信"
    location: "书店"
    time: "雨夜"
    summary: "林秋在旧书店收到沈砚带来的神秘来信。"
    ai_inference:
      source: "ai_inferred"
      needs_author_review: true
      source_excerpt: "林秋在旧书店收到沈砚带来的神秘来信。"
      confidence: "high"
      conflict: "林秋想回避父亲失踪的真相，但来信迫使他重新面对过去。"
      dramatic_purpose: "引出主线悬念，并推动主角踏上调查。"
      suggested_dialogue:
        - "如果这封信是真的，我就再也不能装作什么都没发生。"
    beats:
      - id: "beat_1_1"
        action: "雨水敲打旧书店玻璃"
    dialogue:
      - id: "line_1_1"
        speaker: "沈砚"
        text: "这封信提到了你父亲失踪前最后去过的地方。"
        subtext: "待作者打磨"
    revision_notes:
      - "检查场景冲突是否足够清晰"
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定场景标识。 |
| `source_chapter` | number | 来源章节序号，保留小说到剧本的追溯关系。 |
| `title` | string | 场景标题，默认来自章节标题。 |
| `location` | string | 场景地点，可由作者继续精修为内景/外景。 |
| `time` | string | 场景时间，如清晨、夜晚、黄昏。 |
| `summary` | string | 场景摘要，用于快速浏览。 |
| `ai_inference` | object | AI 基于原文理解补充的冲突、戏剧目的和建议对白。 |
| `ai_inference.source_excerpt` | string | 支持本场景判断的一小段原文摘录，便于作者回看依据。 |
| `ai_inference.confidence` | string | 场景推理置信度，取值为 `low`、`medium`、`high`。 |
| `beats` | array | 动作节拍，按事件推进拆分。 |
| `dialogue` | array | 对白列表。 |
| `revision_notes` | array | 二次创作提醒。 |

设计原因：剧本的最小创作单元是场景，不是章节。`source_chapter` 保证可回溯，`beats` 保证动作推进可编辑，`dialogue` 保证对白可以单独打磨。

## beats

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 动作节拍标识。 |
| `action` | string | 可被导演、编剧继续扩展的动作描述。 |

设计原因：小说叙述往往包含心理、背景和动作。转换为剧本时，优先把可表演、可拍摄的动作抽出来，便于后续改成分镜或舞台调度。

## dialogue

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 对白标识。 |
| `speaker` | string | 说话人。 |
| `text` | string | 对白正文。 |
| `subtext` | string | 潜台词或表演提示，初稿可留待补充。 |

设计原因：对白是小说改剧本最需要反复调整的部分。把对白独立成结构化数组，可以支持后续筛选某个角色全部台词、统计台词长度、导出对白表。

## adaptation_notes

`adaptation_notes` 用于说明自动转换的边界和建议，例如"本稿为启发式自动转换结果"。这能提醒评审和作者：工具提供的是低门槛初稿，而不是替代作者判断的最终剧本。

## 设计取舍

1. 使用 YAML 而不是纯文本：YAML 对作者更可读，也适合 Git diff 和 PR 审阅。
2. 保留 `id` 字段：即使作者修改标题或姓名，后续图谱关系、场景引用和版本追踪也更稳定。
3. 按场景组织主体：符合剧本创作和拍摄排练的实际工作流。
4. 保留 `source_chapter`：保证小说原文和剧本初稿之间可追溯，便于检查改编遗漏。
5. 加入 `revision_notes`：自动生成结果必然粗糙，Schema 主动把"待打磨"变成工作流的一部分。
6. 标记 AI 推理字段：人物动机、弧光、场景冲突和建议对白常常需要超出原文直述进行改编判断，因此使用 `inference_source`、`ai_inference.source` 和 `needs_author_review` 明确提醒作者审核，避免把 AI 推理误当作原文事实。
7. 保留依据和置信度：`source_excerpt` 让作者能快速回到原文核对，`confidence` 让评审和作者知道哪些自动判断更需要优先检查。

## 支持的章节识别格式

工具在解析小说文本时，自动识别以下常见章节标记格式（每种标记需独占一行）：

| 格式举例 | 说明 |
| --- | --- |
| `第一章 雨夜来信` | 中文数字 + 章/节/卷/篇/集 |
| `第3章 失踪案件` | 阿拉伯数字 + 章/节 |
| `Chapter 1 The Call` | 英文章节标记 |
| `Part II` / `Act 3` | 英文幕/部标记 |
| `一、` / `二、` / `三、` | 中文数字序号（如《狂人日记》） |
| `（一）` / `（二）` | 括号中文序号 |
| `1.` / `2、` | 阿拉伯数字序号（行内少于40字）|

若文本不含任何章节标记，工具将全文视为单一场景（标题为"未分章文本"），需手动插入章节分隔后重新导入。
