import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { DragEvent } from 'react';
import mammoth from 'mammoth';

interface NovelChapter {
  title: string;
  content: string;
  index: number;
}

interface DialogueLine {
  speaker: string;
  text: string;
}

type CharacterRole = 'protagonist' | 'major_supporting' | 'supporting' | 'minor';
type AdaptationTargetId = 'film_short' | 'feature_film' | 'web_series' | 'tv_episode' | 'stage_play' | 'audio_drama';
type AdaptationStyleId = 'preserve_source' | 'realist' | 'suspense' | 'light_comedy' | 'historical_intrigue' | 'romance' | 'sci_fi' | 'fantasy_epic';

interface ScreenplayCharacter {
  id: string;
  name: string;
  role: CharacterRole;
  motivation?: string;
  arc?: string;
  evidence?: string;
  confidence?: 'low' | 'medium' | 'high';
}

interface CharacterInput {
  name: string;
  role?: string;
  motivation?: string;
  arc?: string;
  evidence?: string;
  confidence?: string;
}

type GenerationMode = 'idle' | 'local' | 'ai' | 'mixed';
type CharacterSource = 'none' | 'local' | 'ai';

interface GenerationStats {
  mode: GenerationMode;
  totalScenes: number;
  aiScenes: number;
  fallbackScenes: number;
  characterSource: CharacterSource;
}

interface YamlQualityCheck {
  label: string;
  detail: string;
  passed: boolean;
}

interface ChapterReadiness {
  index: number;
  title: string;
  wordCount: number;
  sentenceCount: number;
  dialogueCount: number;
  warnings: string[];
  ready: boolean;
}

interface ReviewChecklistItem {
  id: string;
  title: string;
  detail: string;
  status: 'passed' | 'review' | 'todo';
}

interface AdaptationTarget {
  id: AdaptationTargetId;
  name: string;
  shortName: string;
  description: string;
  structureFocus: string;
  pacing: string;
}

interface AdaptationStyle {
  id: AdaptationStyleId;
  name: string;
  shortName: string;
  tone: string;
  dialogueGuide: string;
  beatGuide: string;
  preserveSource?: boolean;
}

const COLORS = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe3ef',
  panel: '#ffffff',
  canvas: '#f5f7fb',
  soft: '#eef2ff',
  accent: '#6d5dfc',
  accentDark: '#4f46e5',
  success: '#10b981',
  danger: '#ef4444',
};

/* ------------------------------------------------------------------ */
/*  AI 增强模块：DeepSeek API 调用                                     */
/* ------------------------------------------------------------------ */

const getDeepSeekApiKey = () => import.meta.env.VITE_DEEPSEEK_API_KEY?.trim() || '';
const getDeepSeekBaseUrl = () => import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

const createEmptyGenerationStats = (): GenerationStats => ({
  mode: 'idle',
  totalScenes: 0,
  aiScenes: 0,
  fallbackScenes: 0,
  characterSource: 'none',
});

const getAIStatus = () => {
  const key = getDeepSeekApiKey();
  return key && key.trim().length > 0 ? 'enabled' : 'disabled';
};

const ADAPTATION_TARGETS: AdaptationTarget[] = [
  {
    id: 'film_short',
    name: '影视短片',
    shortName: '短片',
    description: '突出单线冲突、可拍摄动作和清晰转折。',
    structureFocus: '单线三幕式，场景应服务一个核心冲突',
    pacing: '紧凑，减少旁支铺陈',
  },
  {
    id: 'feature_film',
    name: '电影长片',
    shortName: '长片',
    description: '强调主线成长、关键转折和完整人物弧光。',
    structureFocus: '完整三幕式，保留主线推进、转折点和高潮段落',
    pacing: '中等节奏，允许铺垫但需要清晰转折',
  },
  {
    id: 'web_series',
    name: '短剧分集',
    shortName: '短剧',
    description: '强调高频钩子、人物关系推进和分场悬念。',
    structureFocus: '分集钩子，每章尽量形成可追看的场景推进',
    pacing: '快节奏，场景结尾保留悬念',
  },
  {
    id: 'tv_episode',
    name: '单集电视剧',
    shortName: '单集',
    description: '强调 A/B 线推进、人物关系和集内小高潮。',
    structureFocus: '单集结构，主线推进同时保留人物关系副线',
    pacing: '稳中有起伏，每场需要明确戏剧功能',
  },
  {
    id: 'stage_play',
    name: '舞台剧',
    shortName: '舞台',
    description: '更重视对白、场面调度和同一空间内的戏剧冲突。',
    structureFocus: '舞台空间与对白驱动，动作需可被演员表演',
    pacing: '稳健，允许更长对白和场面调度',
  },
  {
    id: 'audio_drama',
    name: '有声剧',
    shortName: '有声',
    description: '突出声音线索、对白节奏和可听化场景信息。',
    structureFocus: '声音驱动，场景信息需要通过对白、音效和旁白传达',
    pacing: '清晰，避免依赖纯视觉动作',
  },
];

const DEFAULT_ADAPTATION_TARGET = ADAPTATION_TARGETS[0];

const getAdaptationTarget = (id: AdaptationTargetId) => ADAPTATION_TARGETS.find((target) => target.id === id) ?? DEFAULT_ADAPTATION_TARGET;

const ADAPTATION_STYLES: AdaptationStyle[] = [
  {
    id: 'preserve_source',
    name: '保持原文',
    shortName: '原文',
    tone: '不额外套用类型风格，尽量保留原文气质和叙述重心',
    dialogueGuide: '对白以原文人物语气为准，只做剧本化整理',
    beatGuide: '节拍以原文事件顺序为主，减少风格化改写',
    preserveSource: true,
  },
  {
    id: 'realist',
    name: '现实主义',
    shortName: '现实',
    tone: '克制、贴近日常，冲突来自人物处境和选择',
    dialogueGuide: '对白自然，不夸张，保留生活口吻和潜台词',
    beatGuide: '节拍强调行动细节和人物反应',
  },
  {
    id: 'suspense',
    name: '悬疑惊悚',
    shortName: '悬疑',
    tone: '紧张、压迫、信息逐步揭露',
    dialogueGuide: '对白保留隐瞒、试探和反问，避免一次性解释真相',
    beatGuide: '节拍强调线索、误导、停顿和反转',
  },
  {
    id: 'light_comedy',
    name: '轻喜剧',
    shortName: '喜剧',
    tone: '轻快、有误会、有反差，但不破坏人物真实动机',
    dialogueGuide: '对白更短促，允许机锋、反差和节奏性回应',
    beatGuide: '节拍强调误会升级、节奏停顿和关系反差',
  },
  {
    id: 'historical_intrigue',
    name: '古风权谋',
    shortName: '权谋',
    tone: '含蓄、压抑、关系博弈明显',
    dialogueGuide: '对白更克制，注意身份、礼法和暗示',
    beatGuide: '节拍强调试探、布局、权力关系和场面调度',
  },
  {
    id: 'romance',
    name: '情感爱情',
    shortName: '爱情',
    tone: '细腻、暧昧、重视关系推进和情绪转折',
    dialogueGuide: '对白保留试探、回避和未说出口的情绪',
    beatGuide: '节拍强调目光、距离、误解和关系变化',
  },
  {
    id: 'sci_fi',
    name: '科幻设定',
    shortName: '科幻',
    tone: '理性、陌生化，突出设定压力与人物选择',
    dialogueGuide: '对白需要解释必要设定，但避免大段说明书式台词',
    beatGuide: '节拍强调规则揭示、技术限制和选择代价',
  },
  {
    id: 'fantasy_epic',
    name: '奇幻史诗',
    shortName: '奇幻',
    tone: '宏大、宿命感强，强调世界秩序和人物使命',
    dialogueGuide: '对白可更庄重，但需要保留人物差异',
    beatGuide: '节拍强调仪式、阵营、抉择和世界观后果',
  },
];

const DEFAULT_ADAPTATION_STYLE = ADAPTATION_STYLES[0];

const getAdaptationStyle = (id: AdaptationStyleId) => ADAPTATION_STYLES.find((style) => style.id === id) ?? DEFAULT_ADAPTATION_STYLE;

const callDeepSeek = async (systemPrompt: string, userPrompt: string): Promise<string> => {
  const apiKey = getDeepSeekApiKey();
  const baseUrl = getDeepSeekBaseUrl();

  if (!apiKey || !apiKey.trim()) {
    throw new Error('未配置 DeepSeek API Key。请在项目根目录 .env 中设置 VITE_DEEPSEEK_API_KEY 后重启开发服务器。');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 错误 (${response.status})：${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

interface AICharacter {
  name: string;
  role: string;
  evidence: string;
  motivation?: string;
  arc?: string;
  confidence?: string;
}

const aiExtractCharacters = async (chapters: NovelChapter[]): Promise<AICharacter[]> => {
  const fullText = chapters.map((c) => `【${c.title}】\n${c.content}`).join('\n\n');
  const truncatedText = fullText.slice(0, 8000);

  const systemPrompt = `你是一个文学分析助手，专精从中文小说中提取人物角色。

请从以下文本中提取所有人物角色名称。
规则：
1. 提取所有出现的人物，包括：
   - 中文姓名（如"赵家的狗"中的"赵"不算，要完整的，如"鲁迅"、"林黛玉"）
   - 单名或昵称（如"阿Q"、"祥子"）
   - 称呼/绰号/代号（如"狂人"、"孔乙己"、"掌柜"、"赵太爷"、"大哥"）
   - 重复出现的职称代称，前提是它们指向具体个人
2. 不要提取：地名、机构名、物品名、泛指群体（如"众人"、"大家"）
3. 对每个角色输出：name（原文中的称呼）、role（主角protagonist/重要配角major_supporting/配角supporting/龙套minor）、evidence（一句原文证据，说明你为什么认为这是角色）、motivation（基于文本推理的人物动机）、arc（基于文本推理的人物弧光）、confidence（low/medium/high，表示角色判断和推理可靠度）
4. 按重要程度从高到低排列

输出纯 JSON 数组（不要带 markdown 代码块标记）：
[{"name":"狂人","role":"protagonist","evidence":"...","motivation":"...","arc":"...","confidence":"high","frequency":15}]`;

  const result = await callDeepSeek(systemPrompt, truncatedText);

  // 尝试解析 JSON（AI 可能包裹在 \`\`\`json 里）
  const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? result.match(/(\[[\s\S]*\])/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.trim();

  try {
    const characters: AICharacter[] = JSON.parse(jsonStr);
    // 去重合并
    const seen = new Map<string, AICharacter>();
    for (const c of characters) {
      if (!c.name || c.name.length < 1) continue;
      const key = c.name.trim();
      if (!seen.has(key)) seen.set(key, { ...c, name: key });
    }
    return [...seen.values()].slice(0, 15);
  } catch {
    // 解析失败，尝试从文本中提取 name 行
    const names = result.match(/"name"\s*:\s*"([^"]+)"/g);
    if (!names) throw new Error('AI 人物提取结果解析失败');
    return names.slice(0, 15).map((n, i) => {
      const nameMatch = n.match(/"([^"]+)"$/);
      return { name: nameMatch?.[1] ?? `角色${i + 1}`, role: 'supporting', evidence: '', confidence: 'low' };
    });
  }
};

interface AISceneEnrichment {
  location: string;
  time: string;
  summary: string;
  conflict: string;
  dramatic_purpose: string;
  source_excerpt: string;
  confidence: 'low' | 'medium' | 'high';
  camera_direction: string;
  character_action: string;
  subtext_cue: string;
  beats: string[];
  suggested_dialogue: string[];
}

const aiEnrichScene = async (chapter: NovelChapter, target: AdaptationTarget, style: AdaptationStyle): Promise<AISceneEnrichment> => {
  const content = chapter.content.slice(0, 3000);

  const systemPrompt = `你是剧本顾问，负责将小说章节转换为剧本场景卡片。

当前改编目标：
- 类型：${target.name}
- 结构重点：${target.structureFocus}
- 节奏要求：${target.pacing}

${style.preserveSource ? `当前改编风格：
- 风格：保持原文
- 要求：不要额外套用类型风格，优先保留原文气质、人物语气和叙事重心。只做剧本结构化整理。` : `当前改编风格：
- 风格：${style.name}
- 语气：${style.tone}
- 对白指南：${style.dialogueGuide}
- 节拍指南：${style.beatGuide}`}

请分析以下文本，输出 JSON：

{
  "location": "场景地点（具体描述，如"江南小城的石板街道"而非"街道"）",
  "time": "时间设定（如"深秋夜晚"、"暮春清晨"）",
  "summary": "场景摘要（2-3句话概括这个场景发生了什么，聚焦戏剧性冲突）",
  "conflict": "本场景的核心冲突，允许基于原文进行合理改编推理",
  "dramatic_purpose": "本场景在剧本结构中的作用，例如引出危机、推进关系、制造悬念",
  "source_excerpt": "最能支持本场景判断的一小段原文摘录，不超过80字",
  "confidence": "low/medium/high，表示场景判断和推理可靠度",
  "camera_direction": "镜头或舞台调度建议，说明该场景如何被看见或呈现",
  "character_action": "人物可表演动作，避免只写心理活动",
  "subtext_cue": "潜台词提示，说明对白或沉默背后的真实意图",
  "beats": ["动作节拍1：人物做什么", "动作节拍2", "动作节拍3", "动作节拍4", "动作节拍5"],
  "suggested_dialogue": ["可选新增对白建议1", "可选新增对白建议2"]
}

要求：
- beats 输出 3-5 个节拍，每个节拍描述一个具体的戏剧动作或转折
- summary 要突出冲突和张力
- 场景设计需要贴合当前改编目标，不要输出泛泛的小说摘要
- suggested_dialogue 和 beats 需要贴合当前改编风格
- camera_direction、character_action、subtext_cue 必须可被作者直接编辑为剧本调度，不要只写“待补充”
- conflict、dramatic_purpose、suggested_dialogue 可以基于原文合理推理，但不要伪称为原文直接出现
- 语言使用流畅中文

输出纯 JSON，不要包裹在 markdown 代码块里。`;

  const result = await callDeepSeek(systemPrompt, `章节：${chapter.title}\n\n${content}`);

  const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? result.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    const fallbackSentences = chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 5).map((s) => compactText(s.trim(), 110));
    return {
      location: parsed.location || inferLocation(chapter.content),
      time: parsed.time || inferTime(chapter.content),
      summary: parsed.summary || compactText(chapter.content, 120),
      conflict: parsed.conflict || 'AI 未明确给出冲突，待作者核对',
      dramatic_purpose: parsed.dramatic_purpose || 'AI 未明确给出戏剧目的，待作者核对',
      source_excerpt: compactText(parsed.source_excerpt || chapter.content, 80),
      confidence: parsed.confidence === 'low' || parsed.confidence === 'high' ? parsed.confidence : 'medium',
      camera_direction: compactText(parsed.camera_direction || '以中景建立场景关系，关键转折处切近人物反应。', 120),
      character_action: compactText(parsed.character_action || '让主要人物通过行动回应冲突，减少纯心理叙述。', 120),
      subtext_cue: compactText(parsed.subtext_cue || '对白下保留未说出口的真实意图，供作者后续打磨。', 120),
      beats: Array.isArray(parsed.beats) && parsed.beats.length > 0 ? parsed.beats : fallbackSentences,
      suggested_dialogue: Array.isArray(parsed.suggested_dialogue) ? parsed.suggested_dialogue : [],
    };
  } catch {
    return {
      location: inferLocation(chapter.content),
      time: inferTime(chapter.content),
      summary: `待AI分析：${compactText(chapter.content, 120)}`,
      conflict: '待作者根据原文补充场景冲突',
      dramatic_purpose: '待作者确认本场景在剧本结构中的作用',
      source_excerpt: compactText(chapter.content, 80),
      confidence: 'low',
      camera_direction: 'AI 场景分析失败，待作者补充镜头或舞台调度',
      character_action: 'AI 场景分析失败，待作者补充人物可表演动作',
      subtext_cue: 'AI 场景分析失败，待作者补充对白潜台词',
      beats: chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 5).map((s) => compactText(s.trim(), 110)),
      suggested_dialogue: [],
    };
  }
};

const yamlScalar = (value: string | number | boolean) => {
  const text = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (text.includes('\n')) {
    return `|-\n${text.split('\n').map((line) => `      ${line}`).join('\n')}`;
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

// 章节匹配正则：覆盖多种中英文章节格式，兼顾精确度
const CHAPTER_PATTERN = new RegExp(
  '(^|\\n)[ \\t\u3000]*(' +
  // 1. 第X章/节/卷/篇/集/回（中文数字或阿拉伯数字）— 覆盖红楼梦"第X回"
  '(?:第[一二三四五六七八九十百千万零〇\\d]+[章节卷篇集回][^\\n]*)' +
  // 2. Chapter N / Part N / Act N / Scene / Episode（英文），支持罗马数字 + 点 — 覆盖荒野的呼唤
  '|(?:(?:Chapter|Part|Act|Scene|Episode)\\s+[\\dIVXivx]+[^\\n]*)' +
  // 3. 全角空格前缀 + 单个中文数字独占一行，覆盖狂人日记的独立中文序号
  '|(?:[\u3000\\s]*[一二三四五六七八九十]+[ \\t\u3000]*$)' +
  // 4. 中文数字序号 "一、" "二、" 等独占一行
  '|(?:[一二三四五六七八九十]{1,3}[、。])' +
  // 5. 括号中文序号 "（一）" "（二）"
  '|(?:（[一二三四五六七八九十]{1,3}）)' +
  // 6. 阿拉伯数字序号，后跟内容必须含中文字符，防误匹配"1.F."等版权条款
  '|(?:\\d{1,3}[.、][ \\t]*[\\u4e00-\\u9fa5][^\\n]{0,38})' +
  ')[ \\t\u3000]*\\n',
  'gim'
);

const splitNovelChapters = (text: string): NovelChapter[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const matches = [...normalized.matchAll(CHAPTER_PATTERN)];
  if (matches.length === 0) {
    return [{ title: '未分章文本', content: normalized, index: 1 }];
  }

  // Build raw list; filter out entries whose body is too short (table-of-contents rows,
  // copyright notices, etc. typically have no real content below the heading).
  const rawChapters = matches
    .map((match, idx) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = idx + 1 < matches.length ? matches[idx + 1].index ?? normalized.length : normalized.length;
      return { title: match[2].trim(), content: normalized.slice(start, end).trim(), matchIndex: match.index ?? 0 };
    })
    .filter((chapter) => chapter.content.length >= 30);

  // De-duplicate by title: when the same title appears in both a TOC and the body,
  // keep only the last occurrence (body position has a higher matchIndex).
  const titleLastIndex = new Map<string, number>();
  rawChapters.forEach((chapter, idx) => {
    const key = chapter.title.replace(/\s+/g, '').toLowerCase();
    titleLastIndex.set(key, idx);
  });

  return rawChapters
    .filter((chapter, idx) => {
      const key = chapter.title.replace(/\s+/g, '').toLowerCase();
      return titleLastIndex.get(key) === idx;
    })
    .map((chapter, idx) => ({ title: chapter.title, content: chapter.content, index: idx + 1 }));
};

const compactText = (value: string, max = 100) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const COMMON_CHINESE_SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧利师巩聂关荆司马上官欧阳夏侯诸葛闻人东方赫连皇甫尉迟公孙';

const CHARACTER_STOP_WORDS = new Set([
  '没有', '自己', '他们', '我们', '你们', '她们', '咱们', '别人', '众人', '大家', '人们',
  '这个', '那个', '这些', '那些', '一种', '一个', '一些', '一样', '一面', '一声', '一句', '一般', '一切', '一定',
  '什么', '怎么', '为什么', '时候', '地方', '事情', '东西', '眼睛', '声音', '心里', '今天', '明天', '昨天', '现在',
  '可是', '还是', '或者', '虽然', '因为', '所以', '于是', '然而', '但是', '不过', '而且', '并且',
  '可以', '已经', '知道', '看见', '听见', '觉得', '以为', '起来', '出来', '过来', '过去',
  '不是', '就是', '只是', '又是', '也是', '还有', '不能', '不敢', '不曾', '忽然', '仿佛', '似乎',
  '从前', '以后', '上面', '下面', '里面', '外面', '前面', '后面', '旁边', '太阳', '月亮',
  '他的', '她的', '我的', '你的', '他们的', '我们的', '你们的', '的人', '人的人', '吃人', '吃人的',
]);

const CHARACTER_ALIAS_ALLOWLIST = new Set([
  '阿Q', '孔乙己', '祥子', '狂人', '大哥', '老头子', '掌柜', '赵太爷',
]);

const normalizeCharacterRole = (role?: string): CharacterRole => {
  if (role === 'protagonist' || role === 'major_supporting' || role === 'supporting' || role === 'minor') return role;
  return 'supporting';
};

const normalizeConfidence = (value?: string): 'low' | 'medium' | 'high' => {
  if (value === 'low' || value === 'high') return value;
  return 'medium';
};

const normalizeCharacterName = (value: string) => value
  .replace(/^[\s"'“”‘’《》【】（）()，,。！？!?:：；;、]+|[\s"'“”‘’《》【】（）()，,。！？!?:：；;、]+$/g, '')
  .trim();

const isPlausibleCharacterName = (rawName: string, strongEvidence = false) => {
  const name = normalizeCharacterName(rawName);
  if (name.length < 2 || name.length > 6) return false;
  if (CHARACTER_STOP_WORDS.has(name)) return false;
  if (/的|了|着|过/.test(name)) return false;
  if (/^[一二三四五六七八九十百千万零〇\d]+$/.test(name)) return false;
  if (/^[这那哪几什怎为可但并或又还也都很更最再从把被将与和及在向到对给]$/.test(name[0])) return false;
  if (/(时候|地方|事情|声音|眼睛|心里|东西|文本|章节|场景)$/.test(name)) return false;
  if (CHARACTER_ALIAS_ALLOWLIST.has(name)) return true;

  const surnamePattern = new RegExp(`^[${COMMON_CHINESE_SURNAMES}][\\u4e00-\\u9fa5]{1,2}$`);
  const nicknamePattern = /^(?:阿[\u4e00-\u9fa5A-Za-z]{1,2}|老[\u4e00-\u9fa5]{1,2}|小[\u4e00-\u9fa5]{1,2}|[\u4e00-\u9fa5]老[一二三四五六七八九十\d])$/;
  const titlePattern = /^[\u4e00-\u9fa5]{1,3}(?:哥|嫂|姐|叔|伯|爷|娘|婶|掌柜|太爷|老爷|小姐|姑娘|和尚|道士|师傅|先生|夫人)$/;

  return surnamePattern.test(name) || nicknamePattern.test(name) || titlePattern.test(name) || strongEvidence;
};

const toScreenplayCharacters = (characters: CharacterInput[]): ScreenplayCharacter[] => {
  const seen = new Set<string>();
  const normalized: ScreenplayCharacter[] = [];
  for (const character of characters) {
    const name = normalizeCharacterName(character.name);
    if (!isPlausibleCharacterName(name, true) || seen.has(name)) continue;
    seen.add(name);
    normalized.push({
      id: `char_${String(normalized.length + 1).padStart(2, '0')}`,
      name,
      role: normalizeCharacterRole(character.role),
      motivation: character.motivation ? compactText(character.motivation, 120) : undefined,
      arc: character.arc ? compactText(character.arc, 120) : undefined,
      evidence: character.evidence ? compactText(character.evidence, 120) : undefined,
      confidence: normalizeConfidence(character.confidence),
    });
  }
  return normalized.slice(0, 15);
};

const extractQuotedDialogue = (content: string): DialogueLine[] => {
  const lines: DialogueLine[] = [];
  const pattern = /([\u4e00-\u9fa5A-Za-z]{2,8})\s*(?:说|问|答道|低声说|回答|喊道|说道|笑道)[：:]\s*[""]([^""]+)[""]?/g;
  for (const match of content.matchAll(pattern)) {
    const speaker = normalizeCharacterName(match[1]);
    if (isPlausibleCharacterName(speaker, true)) {
      lines.push({ speaker, text: match[2].trim() });
    }
  }
  return lines;
};

const extractCharacters = (chapters: NovelChapter[]) => {
  const fullText = chapters.map((c) => c.content).join('\n');
  const candidates = new Map<string, { score: number; strong: boolean }>();

  const addCandidate = (rawName: string, score: number, strong = false) => {
    const name = normalizeCharacterName(rawName);
    if (!isPlausibleCharacterName(name, strong)) return;
    const current = candidates.get(name);
    candidates.set(name, { score: (current?.score ?? 0) + score, strong: Boolean(current?.strong || strong) });
  };

  const speechVerb = '(?:说|说道|问|答|答道|回答|喊|喊道|叫|叫道|笑道|低声说|高声说|大声说|冷冷地说|喃喃道|叹道|道|曰)';
  const surnameName = `[${COMMON_CHINESE_SURNAMES}][\\u4e00-\\u9fa5]{1,2}`;
  const aliasName = '(?:阿[\\u4e00-\\u9fa5A-Za-z]{1,2}|老[\\u4e00-\\u9fa5]{1,2}|小[\\u4e00-\\u9fa5]{1,2}|[\\u4e00-\\u9fa5]老[一二三四五六七八九十\\d]|[\\u4e00-\\u9fa5]{1,3}(?:哥|嫂|姐|叔|伯|爷|娘|婶|掌柜|太爷|老爷|小姐|姑娘|和尚|道士|师傅|先生|夫人)|阿Q|孔乙己|祥子|狂人)';
  const characterName = `(${surnameName}|${aliasName})`;

  const speakerPattern = new RegExp(`${characterName}\\s*${speechVerb}[：:\\s“"']`, 'g');
  for (const match of fullText.matchAll(speakerPattern)) {
    addCandidate(match[1], 10, true);
  }

  const actionPattern = new RegExp(`${characterName}(?=(?:看见|听见|走|来|去|站|坐|想|觉得|知道|发现|回头|摇头|点头|拿|把|给|将|忽然|便|却|又))`, 'g');
  for (const match of fullText.matchAll(actionPattern)) {
    addCandidate(match[1], 4);
  }

  const repeatedNamePattern = new RegExp(characterName, 'g');
  for (const match of fullText.matchAll(repeatedNamePattern)) {
    addCandidate(match[1], 1);
  }

  return [...candidates.entries()]
    .filter(([, meta]) => meta.strong || meta.score >= 4)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 15)
    .map(([name, meta], index) => ({
      id: `char_${String(index + 1).padStart(2, '0')}`,
      name,
      role: index === 0 ? 'protagonist' : meta.score >= 10 ? 'major_supporting' : 'supporting',
    })) satisfies ScreenplayCharacter[];
};

const inferLocation = (content: string) => /地下室|密室|书店|钟楼|门口|房间|街道|山谷|城门|屋内|庭院/.exec(content)?.[0] ?? '待定场景';
const inferTime = (content: string) => /清晨|早晨|雨夜|深夜|夜晚|黄昏|午后|傍晚|黎明/.exec(content)?.[0] ?? '待定时间';

const convertNovelToScreenplayYaml = (text: string, target: AdaptationTarget, style: AdaptationStyle, characterOverrides?: CharacterInput[]) => {
  const chapters = splitNovelChapters(text);
  if (chapters.length < 3) {
    throw new Error(`当前识别到 ${chapters.length} 个章节，请至少导入或粘贴 3 个章节。`);
  }

  const characters = characterOverrides && characterOverrides.length > 0
    ? toScreenplayCharacters(characterOverrides)
    : extractCharacters(chapters);
  const scenes = chapters.map((chapter, index) => {
    const sentences = chapter.content.split(/[。！？!?]\s*/).map((item) => item.trim()).filter(Boolean);
    const dialogues = extractQuotedDialogue(chapter.content).slice(0, 8);
    return {
      id: `scene_${String(index + 1).padStart(2, '0')}`,
      sourceChapter: chapter.index,
      title: chapter.title.replace(/^第[一二三四五六七八九十百千万0-9]+章\s*/, '') || chapter.title,
      location: inferLocation(chapter.content),
      time: inferTime(chapter.content),
      summary: compactText(sentences.slice(0, 2).join('。'), 120),
      beats: sentences.slice(0, 5).map((sentence, beatIndex) => ({ id: `beat_${index + 1}_${beatIndex + 1}`, action: compactText(sentence, 110) })),
      dialogues,
    };
  });

  const characterBlock = characters.length > 0
    ? characters.map((character) => [
      `  - id: "${character.id}"`,
      `    name: ${yamlScalar(character.name)}`,
      `    role: "${character.role}"`,
      '    motivation: "待作者补充"',
    ].join('\n'))
    : ['  []'];

  const lines = [
    'schema_version: "1.0"',
    'project:',
    '  title: "小说改编剧本初稿"',
    '  source_type: "novel"',
    `  target_format: ${yamlScalar(target.name)}`,
    `  structure_focus: ${yamlScalar(target.structureFocus)}`,
    `  pacing: ${yamlScalar(target.pacing)}`,
    `  adaptation_style: ${yamlScalar(style.name)}`,
    `  style_policy: "${style.preserveSource ? 'preserve_source' : 'style_guided'}"`,
    `  tone: ${yamlScalar(style.tone)}`,
    `  dialogue_style: ${yamlScalar(style.dialogueGuide)}`,
    `  chapter_count: ${chapters.length}`,
    '  logline: "由小说章节自动提炼出的可编辑剧本初稿。"',
    'characters:',
    ...characterBlock,
    'scenes:',
    ...scenes.map((scene) => [
      `  - id: "${scene.id}"`,
      `    source_chapter: ${scene.sourceChapter}`,
      `    title: ${yamlScalar(scene.title)}`,
      `    location: ${yamlScalar(scene.location)}`,
      `    time: ${yamlScalar(scene.time)}`,
      `    summary: ${yamlScalar(scene.summary)}`,
      '    staging:',
      '      camera: "用中景建立人物与空间关系，关键情绪处切近反应"',
      '      action: "补充人物可表演动作，减少纯心理叙述"',
      '      subtext: "标注对白背后的真实意图，供作者继续打磨"',
      '    beats:',
      ...scene.beats.map((beat) => [
        `      - id: "${beat.id}"`,
        `        action: ${yamlScalar(beat.action)}`,
      ].join('\n')),
      '    dialogue:',
      ...(scene.dialogues.length > 0 ? scene.dialogues.map((dialogue, dialogueIndex) => [
        `      - id: "line_${scene.sourceChapter}_${dialogueIndex + 1}"`,
        `        speaker: ${yamlScalar(dialogue.speaker)}`,
        `        text: ${yamlScalar(dialogue.text)}`,
        '        subtext: "待作者打磨"',
      ].join('\n')) : ['      []']),
      '    revision_notes:',
      '      - "检查 staging.camera、staging.action、staging.subtext 是否符合作者想要的呈现方式"',
    ].join('\n')),
    'adaptation_notes:',
    '  - "本稿为浏览器本地启发式转换结果，不调用外部接口。"',
    `  - "当前改编目标：${target.name}。${target.description}"`,
    `  - "当前改编风格：${style.name}。${style.tone}"`,
    '  - "建议作者继续补充人物动机、场景调度和对白节奏。"',
    'review_checklist:',
    '  - id: "review_chapters"',
    '    item: "确认每个小说章节都对应至少一个剧本场景"',
    '    status: "todo"',
    '    owner: "author"',
    '  - id: "review_characters"',
    '    item: "核对人物表是否遗漏关键角色或误收泛称"',
    '    status: "todo"',
    '    owner: "author"',
    '  - id: "review_dialogue"',
    '    item: "补写缺失对白、潜台词和可表演动作"',
    '    status: "todo"',
    '    owner: "author"',
  ];
  return lines.join('\n');
};

const readDocumentText = async (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  if (['txt', 'md', 'markdown', 'yaml', 'yml'].includes(extension ?? '')) {
    return file.text();
  }
  throw new Error('暂支持 .txt、.md、.docx 文档导入。');
};

const aiRefineYamlFragment = async (yamlFragment: string, instruction: string): Promise<string> => {
  const systemPrompt = `你是剧本 YAML 编辑助手。你只负责根据作者要求精修用户选中的 YAML 片段。

规则：
1. 只输出修改后的 YAML 片段，不要输出 markdown 代码块、解释或前后缀。
2. 保持 YAML 缩进和字段名风格，不要擅自改动未被选中的上下文。
3. 若涉及 AI 推理、补写、改写，请保留或新增 needs_author_review: true。
4. 若改写场景，优先维护 scenes 下的 summary、ai_inference、staging、beats、dialogue、revision_notes 等结构。
5. 若作者要求不明确，只做保守润色，不改变原文事实。`;

  return callDeepSeek(systemPrompt, `作者修改要求：${instruction}\n\n选中的 YAML 片段：\n${yamlFragment}`);
};

function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [novelInput, setNovelInput] = useState('');
  const [screenplayYaml, setScreenplayYaml] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [importedFileName, setImportedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [yamlRefining, setYamlRefining] = useState(false);
  const [yamlEditInstruction, setYamlEditInstruction] = useState('');
  const [yamlSelection, setYamlSelection] = useState({ start: 0, end: 0, text: '' });
  const [aiCharacters, setAiCharacters] = useState<CharacterInput[] | null>(null);
  const [adaptationTargetId, setAdaptationTargetId] = useState<AdaptationTargetId>(DEFAULT_ADAPTATION_TARGET.id);
  const [adaptationStyleId, setAdaptationStyleId] = useState<AdaptationStyleId>(DEFAULT_ADAPTATION_STYLE.id);
  const [generationStats, setGenerationStats] = useState<GenerationStats>(() => createEmptyGenerationStats());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const yamlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const aiAvailable = getAIStatus() === 'enabled';
  const adaptationTarget = useMemo(() => getAdaptationTarget(adaptationTargetId), [adaptationTargetId]);
  const adaptationStyle = useMemo(() => getAdaptationStyle(adaptationStyleId), [adaptationStyleId]);

  const chapters = useMemo(() => splitNovelChapters(novelInput), [novelInput]);
  const canContinue = chapters.length >= 3;

  // 人物：AI 结果优先，降级到正则
  const effectiveCharacters = useMemo(() => {
    if (aiCharacters && aiCharacters.length > 0) return aiCharacters;
    return extractCharacters(chapters).map((c) => ({ name: c.name, role: c.role }));
  }, [aiCharacters, chapters]);

  const characterPanelMode = aiAvailable && aiLoading && !aiCharacters
    ? 'checking'
    : aiCharacters && aiCharacters.length > 0 ? 'ai' : 'local';

  const characterPanelLabel = characterPanelMode === 'checking'
    ? 'AI 校对中'
    : characterPanelMode === 'ai' ? 'AI 已校对' : '规则初筛';

  const graph = useMemo(() => {
    // 图谱展示候选人物在同一章节内共同出现的线索。
    const characters = effectiveCharacters.map((c, i) => ({
      id: `char_${i + 1}`,
      name: c.name,
      role: c.role,
      mentionCount: 0,
      chapterCount: 0,
      chapters: [] as number[],
      x: 0,
      y: 0,
    }));
    const width = 820;
    const height = 520;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.34;
    const nodes = characters.map((character, index) => {
      if (index === 0) return { ...character, x: centerX, y: centerY };
      const angle = ((index - 1) / Math.max(characters.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
      return { ...character, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
    });
    const byName = new Map(nodes.map((node) => [node.name, node]));
    const edgeMap = new Map<string, { source: string; target: string; count: number }>();

    nodes.forEach((node) => {
      const chapterIndexes: number[] = [];
      let mentionCount = 0;
      chapters.forEach((chapter) => {
        const matches = chapter.content.match(new RegExp(node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? [];
        if (matches.length > 0) {
          chapterIndexes.push(chapter.index);
          mentionCount += matches.length;
        }
      });
      node.chapters = chapterIndexes;
      node.chapterCount = chapterIndexes.length;
      node.mentionCount = mentionCount;
    });

    chapters.forEach((chapter) => {
      const present = nodes.filter((node) => chapter.content.includes(node.name)).map((node) => node.name);
      for (let i = 0; i < present.length; i += 1) {
        for (let j = i + 1; j < present.length; j += 1) {
          const source = byName.get(present[i]);
          const target = byName.get(present[j]);
          if (!source || !target) continue;
          const key = [source.id, target.id].sort().join('__');
          const current = edgeMap.get(key);
          edgeMap.set(key, current ? { ...current, count: current.count + 1 } : { source: source.id, target: target.id, count: 1 });
        }
      }
    });
    const edges = [...edgeMap.values()]
      .sort((a, b) => b.count - a.count)
      .map((edge) => ({
        ...edge,
        sourceName: nodes.find((node) => node.id === edge.source)?.name ?? edge.source,
        targetName: nodes.find((node) => node.id === edge.target)?.name ?? edge.target,
      }));
    return { width, height, nodes, edges };
  }, [effectiveCharacters, chapters]);

  const draftScenes = useMemo(() => chapters.map((chapter, index) => {
    const sentences = chapter.content.split(/[。！？!?]\s*/).map((item) => item.trim()).filter(Boolean);
    return {
      id: `scene_${index + 1}`,
      title: chapter.title,
      summary: compactText(sentences.slice(0, 2).join('。'), 96),
      beats: sentences.slice(0, 3).map((sentence) => compactText(sentence, 72)),
      dialogueCount: extractQuotedDialogue(chapter.content).length,
    };
  }), [chapters]);

  const conversionDiagnostics = useMemo(() => {
    const dialogueCount = draftScenes.reduce((sum, scene) => sum + scene.dialogueCount, 0);
    const modeLabel: Record<GenerationMode, string> = {
      idle: '待生成',
      local: '本地生成',
      ai: 'AI 增强',
      mixed: '混合降级',
    };
    const characterSourceLabel: Record<CharacterSource, string> = {
      none: '待确认',
      local: '规则初筛',
      ai: 'AI 提取',
    };
    return [
      { label: '章节输入', value: `${chapters.length} 章`, ok: canContinue },
      { label: '人物候选', value: `${effectiveCharacters.length} 个`, ok: effectiveCharacters.length > 0 },
      { label: '草案场景', value: `${draftScenes.length} 个`, ok: draftScenes.length === chapters.length && draftScenes.length >= 3 },
      { label: '对白线索', value: `${dialogueCount} 条`, ok: dialogueCount > 0 },
      { label: '生成模式', value: modeLabel[generationStats.mode], ok: generationStats.mode !== 'idle' },
      { label: '人物来源', value: characterSourceLabel[generationStats.characterSource], ok: generationStats.characterSource !== 'none' },
      { label: 'AI 场景', value: `${generationStats.aiScenes}/${generationStats.totalScenes || chapters.length}`, ok: generationStats.mode === 'ai' || generationStats.aiScenes > 0 },
      { label: '降级场景', value: `${generationStats.fallbackScenes} 个`, ok: generationStats.fallbackScenes === 0 },
      { label: 'YAML 状态', value: screenplayYaml ? '已生成' : '待生成', ok: Boolean(screenplayYaml) },
    ];
  }, [canContinue, chapters.length, draftScenes, effectiveCharacters.length, generationStats, screenplayYaml]);

  const yamlQualityChecks = useMemo<YamlQualityCheck[]>(() => {
    const sceneCount = screenplayYaml.match(/\n\s{2}- id: "scene_/g)?.length ?? 0;
    const characterCount = screenplayYaml.match(/\n\s{2}- id: "char_/g)?.length ?? 0;
    const beatCount = screenplayYaml.match(/\n\s{6}- id: "beat_/g)?.length ?? 0;
    const dialogueCount = screenplayYaml.match(/\n\s{6}- id: "line_/g)?.length ?? 0;
    const expectsAiInference = generationStats.mode === 'ai' || generationStats.mode === 'mixed';

    return [
      {
        label: 'Schema 版本',
        detail: screenplayYaml.includes('schema_version:') ? '已声明' : '待生成',
        passed: screenplayYaml.includes('schema_version:'),
      },
      {
        label: '人物表',
        detail: `${characterCount} 个角色`,
        passed: characterCount > 0,
      },
      {
        label: '场景列表',
        detail: `${sceneCount}/${chapters.length || 0} 个场景`,
        passed: sceneCount >= 3 && sceneCount === chapters.length,
      },
      {
        label: '改编目标',
        detail: screenplayYaml.includes('target_format:') ? adaptationTarget.name : '待写入',
        passed: screenplayYaml.includes('target_format:'),
      },
      {
        label: '改编风格',
        detail: screenplayYaml.includes('adaptation_style:') ? adaptationStyle.name : '待写入',
        passed: screenplayYaml.includes('adaptation_style:'),
      },
      {
        label: '动作节拍',
        detail: `${beatCount} 条节拍`,
        passed: beatCount >= Math.max(chapters.length, 1),
      },
      {
        label: '对白线索',
        detail: dialogueCount > 0 ? `${dialogueCount} 条对白` : '暂无对白',
        passed: dialogueCount > 0,
      },
      {
        label: '调度层',
        detail: screenplayYaml.includes('staging:') ? '已包含镜头/动作/潜台词' : '待生成',
        passed: screenplayYaml.includes('staging:'),
      },
      {
        label: 'AI 推理',
        detail: screenplayYaml.includes('ai_inference:') ? '已标记需审核' : expectsAiInference ? '待写入' : '本地模式不要求',
        passed: !expectsAiInference || screenplayYaml.includes('ai_inference:'),
      },
      {
        label: '原文依据',
        detail: screenplayYaml.includes('source_excerpt:') ? '已写入摘录' : expectsAiInference ? '待写入' : '本地模式不要求',
        passed: !expectsAiInference || screenplayYaml.includes('source_excerpt:'),
      },
      {
        label: '打磨说明',
        detail: screenplayYaml.includes('adaptation_notes:') ? '已包含' : '待生成',
        passed: screenplayYaml.includes('adaptation_notes:'),
      },
      {
        label: '审稿清单',
        detail: screenplayYaml.includes('review_checklist:') ? '已写入' : '待生成',
        passed: screenplayYaml.includes('review_checklist:'),
      },
    ];
  }, [adaptationStyle.name, adaptationTarget.name, chapters.length, generationStats.mode, screenplayYaml]);

  const adaptationReviewChecklist = useMemo<ReviewChecklistItem[]>(() => {
    const hasAiInference = screenplayYaml.includes('ai_inference:');
    const hasSourceExcerpt = screenplayYaml.includes('source_excerpt:');
    const lowConfidence = screenplayYaml.includes('confidence: "low"') || generationStats.fallbackScenes > 0;
    const dialogueCount = draftScenes.reduce((sum, scene) => sum + scene.dialogueCount, 0);

    return [
      {
        id: 'chapters',
        title: '章节覆盖',
        detail: canContinue ? `${chapters.length} 章已进入改编流程` : '至少需要 3 章小说文本',
        status: canContinue ? 'passed' : 'todo',
      },
      {
        id: 'characters',
        title: '人物核对',
        detail: effectiveCharacters.length > 0
          ? `${effectiveCharacters.length} 个候选，来源：${characterPanelLabel}`
          : '暂无人物候选，建议检查文本格式或手动补充',
        status: effectiveCharacters.length > 0 ? 'review' : 'todo',
      },
      {
        id: 'dialogue',
        title: '对白打磨',
        detail: dialogueCount > 0 ? `识别到 ${dialogueCount} 条对白线索` : '未识别到对白，剧本初稿需要作者补写台词',
        status: dialogueCount > 0 ? 'review' : 'todo',
      },
      {
        id: 'staging',
        title: '调度与表演',
        detail: screenplayYaml.includes('staging:') ? '已生成镜头调度、人物动作和潜台词提示' : '生成 YAML 后检查调度层',
        status: screenplayYaml.includes('staging:') ? 'review' : 'todo',
      },
      {
        id: 'ai-evidence',
        title: 'AI 推理依据',
        detail: hasAiInference
          ? hasSourceExcerpt ? 'AI 场景推理已附原文摘录' : 'AI 推理缺少原文摘录'
          : aiAvailable ? '生成后检查 AI 推理依据' : '未启用 AI 时不要求',
        status: hasAiInference && hasSourceExcerpt ? 'review' : aiAvailable ? 'todo' : 'passed',
      },
      {
        id: 'risk',
        title: '优先复核项',
        detail: lowConfidence ? '存在低置信度或降级场景，建议优先检查' : screenplayYaml ? '暂无明显高风险降级项' : '生成 YAML 后显示风险提示',
        status: lowConfidence ? 'todo' : screenplayYaml ? 'passed' : 'review',
      },
    ];
  }, [aiAvailable, canContinue, chapters.length, characterPanelLabel, draftScenes, effectiveCharacters.length, generationStats.fallbackScenes, screenplayYaml]);

  const chapterReadiness = useMemo<ChapterReadiness[]>(() => chapters.map((chapter) => {
    const sentences = chapter.content.split(/[。！？!?]\s*/).map((item) => item.trim()).filter(Boolean);
    const dialogueCount = extractQuotedDialogue(chapter.content).length;
    const warnings = [
      chapter.content.length < 120 ? '正文偏短，场景冲突可能不足' : '',
      sentences.length < 3 ? '可提炼节拍偏少' : '',
      dialogueCount === 0 ? '未识别到对白，可后续手动补充' : '',
    ].filter(Boolean);

    return {
      index: chapter.index,
      title: chapter.title,
      wordCount: chapter.content.length,
      sentenceCount: sentences.length,
      dialogueCount,
      warnings,
      ready: warnings.length === 0,
    };
  }), [chapters]);

  const chapterReadinessSummary = useMemo(() => {
    const readyCount = chapterReadiness.filter((chapter) => chapter.ready).length;
    const warningCount = chapterReadiness.reduce((sum, chapter) => sum + chapter.warnings.length, 0);
    return { readyCount, warningCount };
  }, [chapterReadiness]);

  // AI 人物提取：章节变化时自动触发
  const aiRunRef = useRef<string>('');
  useEffect(() => {
    if (!aiAvailable) return;
    const key = chapters.map((c) => `${c.title}:${c.content.length}:${c.content.slice(0, 80)}`).join('|');
    if (key === aiRunRef.current || chapters.length < 3) return;
    aiRunRef.current = key;

    setAiLoading(true);
    aiExtractCharacters(chapters)
      .then((chars) => {
        setAiCharacters(chars.map((c) => ({
          name: c.name,
          role: c.role,
          motivation: c.motivation,
          arc: c.arc,
          evidence: c.evidence,
          confidence: c.confidence,
        })));
        setAiLoading(false);
      })
      .catch((err) => {
        console.warn('AI 人物提取失败，使用正则降级：', err);
        setAiLoading(false);
        setAiCharacters(null);
      });
  }, [chapters, aiAvailable]);

  const ensureAICharacters = useCallback(async () => {
    if (!aiAvailable || chapters.length < 3) return null;
    if (aiCharacters && aiCharacters.length > 0) return aiCharacters;

    setAiLoading(true);
    try {
      const chars = await aiExtractCharacters(chapters);
      const normalized = chars.map((c) => ({
        name: c.name,
        role: c.role,
        motivation: c.motivation,
        arc: c.arc,
        evidence: c.evidence,
        confidence: c.confidence,
      }));
      setAiCharacters(normalized);
      return normalized;
    } catch (err) {
      console.warn('AI 人物提取失败，使用正则降级：', err);
      setAiCharacters(null);
      return null;
    } finally {
      setAiLoading(false);
    }
  }, [aiAvailable, aiCharacters, chapters]);

  const steps = [
    { title: '文本导入', desc: '导入小说文本，识别章节' },
    { title: '章节确认', desc: '确认章节范围与内容' },
    { title: '剧本草案', desc: '查看场景与节拍草案' },
    { title: 'YAML 导出', desc: '生成结构化 YAML 文件' },
  ];

  const workbenchMetrics = [
    { label: '章节', value: `${chapters.length}`, state: canContinue ? 'ok' : 'pending' },
    { label: '人物', value: `${effectiveCharacters.length}`, state: effectiveCharacters.length > 0 ? 'ok' : 'pending' },
    { label: '场景', value: `${draftScenes.length}`, state: draftScenes.length >= 3 ? 'ok' : 'pending' },
    { label: 'YAML', value: screenplayYaml ? '已生成' : '待生成', state: screenplayYaml ? 'ok' : 'pending' },
  ];

  const handleFileImport = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      setError('');
      setStatus('正在读取文档...');
      const text = await readDocumentText(file);
      setNovelInput(text.trim());
      setScreenplayYaml('');
      setImportedFileName(file.name);
      setAiCharacters(null);
      setGenerationStats(createEmptyGenerationStats());
      aiRunRef.current = '';
      setStatus(`已导入：${file.name}`);
      setActiveStep(1);
    } catch (readError) {
      setStatus('');
      setError(readError instanceof Error ? readError.message : '文档读取失败。');
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileImport(file);
  }, [handleFileImport]);

  const generateYaml = async () => {
    setError('');
    setStatus(aiAvailable ? 'AI 正在生成剧本...' : '正在生成剧本...');

    try {
      let yaml: string;
      let finalFallbackSceneCount = 0;
      setGenerationStats({
        mode: aiAvailable ? 'ai' : 'local',
        totalScenes: chapters.length,
        aiScenes: 0,
        fallbackScenes: 0,
        characterSource: 'none',
      });
      const aiCharacterOverride = aiAvailable ? await ensureAICharacters() : null;
      const charactersForYaml = aiCharacterOverride && aiCharacterOverride.length > 0 ? aiCharacterOverride : effectiveCharacters;
      const characterSource: CharacterSource = aiCharacterOverride && aiCharacterOverride.length > 0
        ? 'ai'
        : effectiveCharacters.length > 0 ? 'local' : 'none';
      setGenerationStats((current) => ({ ...current, characterSource }));

      if (aiAvailable && chapters.length >= 3) {
        // AI 增强模式：逐章丰富，保留进度和降级计数，避免生成过程变成黑盒。
        const enrichedScenes: AISceneEnrichment[] = [];
        let aiSceneCount = 0;
        let fallbackSceneCount = 0;

        for (const [index, chapter] of chapters.entries()) {
          setStatus(`AI 正在分析场景 ${index + 1}/${chapters.length}...`);
          try {
            const enrichment = await aiEnrichScene(chapter, adaptationTarget, adaptationStyle);
            enrichedScenes.push(enrichment);
            aiSceneCount += 1;
          } catch {
            fallbackSceneCount += 1;
            enrichedScenes.push({
              location: inferLocation(chapter.content),
              time: inferTime(chapter.content),
              summary: compactText(chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 2).join('。'), 120),
              conflict: 'AI 场景分析失败，待作者根据原文补充冲突',
              dramatic_purpose: 'AI 场景分析失败，待作者确认戏剧作用',
              source_excerpt: compactText(chapter.content, 80),
              confidence: 'low',
              camera_direction: 'AI 场景分析失败，待作者补充镜头或舞台调度',
              character_action: 'AI 场景分析失败，待作者补充人物可表演动作',
              subtext_cue: 'AI 场景分析失败，待作者补充对白潜台词',
              beats: chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 5).map((s) => compactText(s.trim(), 110)),
              suggested_dialogue: [],
            });
          }
          setGenerationStats({
            mode: fallbackSceneCount > 0 ? 'mixed' : 'ai',
            totalScenes: chapters.length,
            aiScenes: aiSceneCount,
            fallbackScenes: fallbackSceneCount,
            characterSource,
          });
        }
        finalFallbackSceneCount = fallbackSceneCount;

        const characters = toScreenplayCharacters(charactersForYaml);
        const scenes = chapters.map((chapter, index) => {
          const enrichment = enrichedScenes[index]!;
          const dialogues = extractQuotedDialogue(chapter.content).slice(0, 8);
          return {
            id: `scene_${String(index + 1).padStart(2, '0')}`,
            sourceChapter: chapter.index,
            title: chapter.title.replace(/^第[一二三四五六七八九十百千万0-9]+章\s*/, '') || chapter.title,
            location: enrichment.location,
            time: enrichment.time,
            summary: enrichment.summary,
            conflict: enrichment.conflict,
            dramaticPurpose: enrichment.dramatic_purpose,
            sourceExcerpt: enrichment.source_excerpt,
            confidence: enrichment.confidence,
            cameraDirection: enrichment.camera_direction,
            characterAction: enrichment.character_action,
            subtextCue: enrichment.subtext_cue,
            suggestedDialogue: enrichment.suggested_dialogue ?? [],
            beats: enrichment.beats
              .filter((b) => b.trim())
              .map((beat, beatIndex) => ({
                id: `beat_${index + 1}_${beatIndex + 1}`,
                action: compactText(beat.trim(), 110),
              })),
            dialogues,
          };
        });

        const characterBlock = characters.length > 0
          ? characters.map((character, ci) => [
            `  - id: "char_${String(ci + 1).padStart(2, '0')}"`,
            `    name: ${yamlScalar(character.name)}`,
            `    role: "${character.role}"`,
            `    motivation: ${yamlScalar(character.motivation ?? 'AI 推理不足，待作者补充')}`,
            `    arc: ${yamlScalar(character.arc ?? '待作者根据剧本方向补充人物弧光')}`,
            `    evidence: ${yamlScalar(character.evidence ?? '待作者核对原文依据')}`,
            `    confidence: "${character.confidence ?? 'medium'}"`,
            '    inference_source: "ai_inferred"',
            '    needs_author_review: true',
          ].join('\n'))
          : ['  []]'];

        yaml = [
          'schema_version: "1.0"',
          'project:',
          '  title: "小说改编剧本初稿（AI 增强）"',
          '  source_type: "novel"',
          `  target_format: ${yamlScalar(adaptationTarget.name)}`,
          `  structure_focus: ${yamlScalar(adaptationTarget.structureFocus)}`,
          `  pacing: ${yamlScalar(adaptationTarget.pacing)}`,
          `  adaptation_style: ${yamlScalar(adaptationStyle.name)}`,
          `  style_policy: "${adaptationStyle.preserveSource ? 'preserve_source' : 'style_guided'}"`,
          `  tone: ${yamlScalar(adaptationStyle.tone)}`,
          `  dialogue_style: ${yamlScalar(adaptationStyle.dialogueGuide)}`,
          `  chapter_count: ${chapters.length}`,
          `  logline: "由 DeepSeek AI 分析小说章节后自动提炼的剧本初稿，建议作者继续打磨。"`,
          'characters:',
          ...characterBlock,
          'scenes:',
          ...scenes.map((scene) => [
            `  - id: "${scene.id}"`,
            `    source_chapter: ${scene.sourceChapter}`,
            `    title: ${yamlScalar(scene.title)}`,
            `    location: ${yamlScalar(scene.location)}`,
            `    time: ${yamlScalar(scene.time)}`,
            `    summary: ${yamlScalar(scene.summary)}`,
            '    ai_inference:',
            '      source: "ai_inferred"',
            '      needs_author_review: true',
            `      source_excerpt: ${yamlScalar(scene.sourceExcerpt)}`,
            `      confidence: "${scene.confidence}"`,
            `      conflict: ${yamlScalar(scene.conflict)}`,
            `      dramatic_purpose: ${yamlScalar(scene.dramaticPurpose)}`,
            '      suggested_dialogue:',
            ...(scene.suggestedDialogue.length > 0
              ? scene.suggestedDialogue.slice(0, 3).map((line) => `        - ${yamlScalar(line)}`)
              : ['        []']),
            '    staging:',
            `      camera: ${yamlScalar(scene.cameraDirection)}`,
            `      action: ${yamlScalar(scene.characterAction)}`,
            `      subtext: ${yamlScalar(scene.subtextCue)}`,
            '    beats:',
            ...(scene.beats.length > 0
              ? scene.beats.map((beat) => [
                `      - id: "${beat.id}"`,
                `        action: ${yamlScalar(beat.action)}`,
              ].join('\n'))
              : ['      []]']),
            '    dialogue:',
            ...(scene.dialogues.length > 0
              ? scene.dialogues.map((dialogue, dialogueIndex) => [
                `      - id: "line_${scene.sourceChapter}_${dialogueIndex + 1}"`,
                `        speaker: ${yamlScalar(dialogue.speaker)}`,
                `        text: ${yamlScalar(dialogue.text)}`,
                '        subtext: "待作者打磨"',
              ].join('\n'))
              : ['      []]']),
            '    revision_notes:',
            '      - "AI 初稿仅供参考，请检查场景冲突是否足够清晰"',
            '      - "请核对 staging 中的镜头调度、人物动作和潜台词是否符合作者意图"',
          ].join('\n')),
          'adaptation_notes:',
          '  - "本稿由 DeepSeek AI 辅助生成，人物提取与场景分析均经 AI 处理。"',
          `  - "当前改编目标：${adaptationTarget.name}。${adaptationTarget.description}"`,
          `  - "当前改编风格：${adaptationStyle.name}。${adaptationStyle.tone}"`,
          `  - "AI 场景分析完成 ${aiSceneCount}/${chapters.length} 章，降级 ${fallbackSceneCount} 章。"`,
          '  - "建议作者继续补充人物动机、场景调度和对白节奏。"',
          '  - "AI 建议可能有误，请以作者判断为准。"',
          'review_checklist:',
          '  - id: "review_ai_evidence"',
          '    item: "逐场核对 source_excerpt 是否支持 AI 推理结论"',
          '    status: "todo"',
          '    owner: "author"',
          '  - id: "review_low_confidence"',
          '    item: "优先复核 confidence 为 low 或 mixed 降级的场景"',
          '    status: "todo"',
          '    owner: "author"',
          '  - id: "review_dialogue"',
          '    item: "确认 suggested_dialogue 是否符合人物口吻，必要时重写"',
          '    status: "todo"',
          '    owner: "author"',
          '  - id: "review_stage_action"',
          '    item: "补充镜头调度、人物动作和场面节奏"',
          '    status: "todo"',
          '    owner: "author"',
        ].join('\n');
      } else {
        // 无 AI：回退到纯本地启发式
        yaml = convertNovelToScreenplayYaml(novelInput, adaptationTarget, adaptationStyle, charactersForYaml);
        setGenerationStats({
          mode: 'local',
          totalScenes: chapters.length,
          aiScenes: 0,
          fallbackScenes: 0,
          characterSource,
        });
      }

      setScreenplayYaml(yaml);
      setStatus(aiAvailable ? `AI 增强 YAML 已生成，${finalFallbackSceneCount > 0 ? '部分场景已降级。' : '全部场景分析完成。'}` : '已生成剧本 YAML 初稿。');
      return yaml;
    } catch (genError) {
      setScreenplayYaml('');
      setStatus('');
      setError(genError instanceof Error ? genError.message : '生成失败，请检查输入。');
      return '';
    }
  };

  const goNext = async () => {
    try {
      setError('');
      if (activeStep === 0 && !canContinue) {
        setError(`当前识别到 ${chapters.length} 个章节，请先导入或粘贴至少 3 个章节。`);
        return;
      }
      if (activeStep === 2) {
        const result = await generateYaml();
        if (!result) return;
      }
      setActiveStep((step) => Math.min(step + 1, steps.length - 1));
    } catch (stepError) {
      setScreenplayYaml('');
      setStatus('');
      setError(stepError instanceof Error ? stepError.message : '处理失败，请检查章节格式。');
    }
  };

  const handleCopy = async () => {
    if (!screenplayYaml) return;
    await navigator.clipboard.writeText(screenplayYaml);
    setStatus('已复制 YAML。');
  };

  const captureYamlSelection = useCallback(() => {
    const textarea = yamlTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    setYamlSelection({ start, end, text: screenplayYaml.slice(start, end) });
  }, [screenplayYaml]);

  const handleRefineYamlSelection = async () => {
    const textarea = yamlTextareaRef.current;
    if (!textarea || !screenplayYaml) return;
    const start = textarea.selectionStart ?? yamlSelection.start;
    const end = textarea.selectionEnd ?? yamlSelection.end;
    const selectedText = screenplayYaml.slice(start, end);

    if (!selectedText.trim()) {
      setError('请先在 YAML 中选中需要 AI 精修的片段。');
      return;
    }
    if (!yamlEditInstruction.trim()) {
      setError('请填写本次想让 AI 怎么修改选中的 YAML 片段。');
      return;
    }
    if (!aiAvailable) {
      setError('AI 精修需要配置 VITE_DEEPSEEK_API_KEY。你仍可直接手动编辑 YAML。');
      return;
    }

    setError('');
    setStatus('AI 正在精修选中的 YAML 片段...');
    setYamlRefining(true);
    try {
      const refined = await aiRefineYamlFragment(selectedText, yamlEditInstruction.trim());
      const nextYaml = `${screenplayYaml.slice(0, start)}${refined.trim()}${screenplayYaml.slice(end)}`;
      setScreenplayYaml(nextYaml);
      setYamlSelection({ start, end: start + refined.trim().length, text: refined.trim() });
      setYamlEditInstruction('');
      setStatus('已用 AI 精修选中的 YAML 片段，请继续核对 Schema 与原文依据。');
      requestAnimationFrame(() => {
        yamlTextareaRef.current?.focus();
        yamlTextareaRef.current?.setSelectionRange(start, start + refined.trim().length);
      });
    } catch (refineError) {
      setError(refineError instanceof Error ? refineError.message : 'AI 精修失败，请稍后重试。');
      setStatus('');
    } finally {
      setYamlRefining(false);
    }
  };

  const handleDownload = () => {
    if (!screenplayYaml) return;
    const blob = new Blob([screenplayYaml], { type: 'text/yaml;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `screenplay-${Date.now()}.yaml`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus('已下载 YAML 文件。');
  };

  const renderStepContent = () => {
    if (activeStep === 0) {
      return (
        <div className="studio-grid-input">
          <div style={{ display: 'grid', gap: 16 }}>
            {/* 上传区：支持点击 + 拖拽导入 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`upload-zone${isDragging ? ' upload-zone--active' : ''}`}
            >
              <div className="upload-icon">{isDragging ? '📂' : '📄'}</div>
              <div className="upload-title">{isDragging ? '松开以导入文件' : '上传文档'}</div>
              <div className="upload-hint">
                {isDragging ? '支持拖拽导入' : '点击或拖拽 .txt / .md / .docx，本地读取不上传。'}
              </div>
              {importedFileName && !isDragging && (
                <div className="upload-filename">📎 {importedFileName}</div>
              )}
            </div>
            <div className="paste-guide">
              <div className="paste-guide-icon">⌘</div>
              <div className="upload-title">复制粘贴</div>
              <div className="upload-hint">把小说正文粘贴到右侧输入框。建议保留章节标题，便于后续确认。</div>
            </div>
            {/* Fix: reset input.value after each selection so that re-selecting the same
                file triggers onChange again (browsers suppress the event otherwise) */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.docx,.yaml,.yml"
              style={{ display: 'none' }}
              onChange={(event) => {
                handleFileImport(event.target.files?.[0]);
                // Reset value so the same file can be selected again
                event.target.value = '';
              }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 16, fontWeight: 950 }}>小说正文</label>
              <span style={{ color: COLORS.muted, fontSize: 13 }}>识别章节：{chapters.length}</span>
            </div>
            <textarea
              value={novelInput}
              onChange={(event) => { setNovelInput(event.target.value); setScreenplayYaml(''); setError(''); setImportedFileName(''); setAiCharacters(null); setGenerationStats(createEmptyGenerationStats()); aiRunRef.current = ''; }}
              placeholder="在这里粘贴小说文本。请至少包含 3 个章节，例如：第一章、第二章、第三章。"
              className={`novel-textarea${error ? ' novel-textarea--error' : ''}`}
            />
          </div>
        </div>
      );
    }

    if (activeStep === 1) {
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>章节确认</h3>
              <p style={{ margin: '6px 0 0', color: COLORS.muted }}>先确认系统识别到的章节，再进入剧本草案。</p>
            </div>
            <button onClick={() => setActiveStep(0)} style={{ padding: '11px 14px', border: `1px solid ${COLORS.line}`, borderRadius: 10, background: '#fff', fontWeight: 850, cursor: 'pointer' }}>返回修改文本</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              ['章节就绪', `${chapterReadinessSummary.readyCount}/${chapters.length}`, chapterReadinessSummary.readyCount === chapters.length && chapters.length >= 3],
              ['待关注项', `${chapterReadinessSummary.warningCount} 项`, chapterReadinessSummary.warningCount === 0],
              ['最低要求', canContinue ? '已满足' : '至少 3 章', canContinue],
            ].map(([label, value, passed]) => (
              <div key={String(label)} style={{ padding: 14, borderRadius: 12, border: `1px solid ${COLORS.line}`, background: '#fff' }}>
                <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 850 }}>{label}</div>
                <div style={{ marginTop: 6, color: passed ? COLORS.success : COLORS.danger, fontSize: 20, fontWeight: 950 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {chapters.map((chapter) => {
              const readiness = chapterReadiness.find((item) => item.index === chapter.index);
              return (
                <div key={chapter.index} className="card" style={{ padding: 18, border: `1px solid ${COLORS.line}`, borderRadius: 14, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 950 }}>第 {chapter.index} 章</div>
                    <div style={{ color: readiness?.ready ? COLORS.success : COLORS.danger, fontSize: 12, fontWeight: 950 }}>
                      {readiness?.ready ? '就绪' : '需关注'}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 18, fontWeight: 950 }}>{chapter.title}</div>
                  <p style={{ color: COLORS.muted, lineHeight: 1.6, minHeight: 46 }}>{compactText(chapter.content, 82)}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: COLORS.muted }}>
                    <span>字数 {readiness?.wordCount ?? chapter.content.length}</span>
                    <span>句子 {readiness?.sentenceCount ?? 0}</span>
                    <span>对白 {readiness?.dialogueCount ?? 0}</span>
                  </div>
                  {readiness && readiness.warnings.length > 0 && (
                    <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                      {readiness.warnings.map((warning) => (
                        <div key={warning} style={{ padding: '7px 9px', borderRadius: 8, background: '#fff7ed', color: '#9a3412', fontSize: 12, lineHeight: 1.5 }}>{warning}</div>
                      ))}
                    </div>
                  )}
              </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeStep === 2) {
      return (
        <div className="studio-grid-draft">
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 950 }}>剧本草案</h3>
            <p style={{ margin: '0 0 18px', color: COLORS.muted }}>这里展示系统即将写入 YAML 的场景摘要、动作节拍和对白数量。</p>
            <div style={{ display: 'grid', gap: 12 }}>
              {draftScenes.map((scene) => (
                <div key={scene.id} style={{ padding: 18, borderRadius: 14, border: `1px solid ${COLORS.line}`, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 950 }}>{scene.title}</div>
                    <div style={{ color: COLORS.muted, fontSize: 13 }}>对白 {scene.dialogueCount} 条</div>
                  </div>
                  <p style={{ color: COLORS.muted, lineHeight: 1.7 }}>{scene.summary || '待补充场景摘要'}</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {scene.beats.map((beat, index) => <div key={`${scene.id}-${index}`} style={{ padding: '8px 10px', borderRadius: 8, background: '#f8fafc', color: COLORS.ink, fontSize: 13 }}>节拍 {index + 1}：{beat}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="character-panel-head">
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>人物共现图谱</h3>
              <span className={`character-source-badge character-source-badge--${characterPanelMode}`}>
                {characterPanelLabel}
              </span>
            </div>
            <div className={`character-graph-card character-graph-card--${characterPanelMode}`}>
              <div className="character-panel-copy">
                {characterPanelMode === 'checking'
                  ? '当前先展示上传文本的规则初筛结果，AI 正在校对人物名单，完成后会平滑更新图谱。'
                  : characterPanelMode === 'ai'
                    ? '图谱基于 AI 校对后的人物候选展示同章出现线索，仍需作者最终确认。'
                    : '图谱展示上传文本的规则初筛人名和同章出现线索，不等同于人工确认的角色设定。'}
              </div>
              <div className="character-metrics-strip">
                {[
                  ['人物', `${graph.nodes.length} 个`],
                  ['共现', `${graph.edges.length} 组`],
                  ['章节', `${chapters.length} 章`],
                ].map(([label, value]) => (
                  <div key={label} className="character-metric-pill">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div
                key={characterPanelMode}
                className="character-list-transition"
              >
                {graph.nodes.length === 0 ? <div style={{ color: COLORS.muted }}>暂无人物候选</div> : graph.nodes.map((node) => (
                  <div key={node.id} className="character-row">
                    <span className={`character-avatar-dot${node.role === 'protagonist' ? ' character-avatar-dot--lead' : ''}`}>{node.name.slice(0, 1)}</span>
                    <div>
                      <div className="character-row-head">
                        <span>{node.name}</span>
                        <small>{node.role}</small>
                      </div>
                      <div className="character-row-meta">
                        出现 {node.mentionCount} 次 · 覆盖 {node.chapterCount} 章
                      </div>
                      {node.chapters.length > 0 && (
                        <div className="character-row-chapters">章节：{node.chapters.slice(0, 6).join('、')}{node.chapters.length > 6 ? '...' : ''}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="cooccurrence-head">
                <h4>同章出现线索</h4>
                <span>前 {Math.min(graph.edges.length, 6)} 组</span>
              </div>
              <div className="cooccurrence-list">
                {graph.edges.length === 0 ? (
                  <div style={{ color: COLORS.muted, fontSize: 13 }}>暂无共现线索</div>
                ) : graph.edges.slice(0, 6).map((edge) => (
                  <div key={`${edge.source}-${edge.target}`} className="cooccurrence-row">
                    <span>{edge.sourceName} - {edge.targetName}</span>
                    <small>同章 {edge.count} 次</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="studio-grid-export">
        <div>
          <div className="yaml-export-head">
            <h3>YAML 导出</h3>
            <div className="yaml-export-actions">
              <button className="yaml-action yaml-action--copy" onClick={handleCopy} disabled={!screenplayYaml}>复制</button>
              <button className="yaml-action yaml-action--download" onClick={handleDownload} disabled={!screenplayYaml}>下载</button>
            </div>
          </div>
          <div className="yaml-editor-tools">
            <div className="yaml-selection-status">
              {yamlSelection.text.trim()
                ? `已选中 ${yamlSelection.text.length} 个字符，可进行 AI 精修`
                : '可直接编辑 YAML；选中片段后可让 AI 按要求精修'}
            </div>
            <div className="yaml-refine-row">
              <input
                value={yamlEditInstruction}
                onChange={(event) => setYamlEditInstruction(event.target.value)}
                placeholder="例如：把这一场改得更悬疑，并补强 staging.subtext"
                disabled={!screenplayYaml || yamlRefining}
              />
              <button onClick={handleRefineYamlSelection} disabled={!screenplayYaml || yamlRefining}>
                {yamlRefining ? '精修中...' : 'AI 精修选区'}
              </button>
            </div>
          </div>
          <textarea
            ref={yamlTextareaRef}
            className="yaml-preview yaml-editor-textarea"
            value={screenplayYaml}
            onChange={(event) => {
              setScreenplayYaml(event.target.value);
              setStatus('YAML 已手动编辑，请按 Schema 继续核对。');
            }}
            onSelect={captureYamlSelection}
            onKeyUp={captureYamlSelection}
            onMouseUp={captureYamlSelection}
            placeholder={'点击“生成 YAML”后显示结构化剧本初稿。生成后可直接编辑，或选中片段进行 AI 精修。'}
          />
        </div>
        <div className="studio-panel studio-panel-pad" style={{ alignSelf: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>YAML 质量检查</h3>
            <a
              href="https://github.com/Moshenluo/novel-graph/blob/codex/yaml-quality-checks/docs/screenplay-yaml-schema.md"
              target="_blank"
              rel="noreferrer"
              style={{ color: COLORS.accentDark, fontSize: 12, fontWeight: 900, textDecoration: 'none' }}
            >
              Schema
            </a>
          </div>
          {yamlQualityChecks.map((item) => (
            <div key={item.label} style={{ padding: '10px 0', borderBottom: `1px solid ${COLORS.line}`, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontWeight: 850 }}>{item.label}</span>
                <span style={{ color: item.passed ? COLORS.success : COLORS.muted, fontWeight: 950 }}>{item.passed ? '通过' : '待完善'}</span>
              </div>
              <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>{item.detail}</div>
            </div>
          ))}
          <h3 style={{ margin: '18px 0 10px', fontSize: 18, fontWeight: 950 }}>转换诊断</h3>
          {conversionDiagnostics.map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${COLORS.line}`, fontSize: 13 }}>
              <span style={{ color: COLORS.muted }}>{item.label}</span>
              <span style={{ color: item.ok ? COLORS.success : COLORS.danger, fontWeight: 900 }}>{item.value}</span>
            </div>
          ))}
          <h3 style={{ margin: '18px 0 10px', fontSize: 18, fontWeight: 950 }}>作者审稿清单</h3>
          <div className="review-checklist">
            {adaptationReviewChecklist.map((item) => (
              <div key={item.id} className={`review-checklist-item review-checklist-item--${item.status}`}>
                <div className="review-checklist-mark">
                  {item.status === 'passed' ? '✓' : item.status === 'review' ? '!' : '·'}
                </div>
                <div>
                  <div className="review-checklist-title">{item.title}</div>
                  <div className="review-checklist-detail">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', color: 'var(--ink)' }}>
      <header className="app-header">
        <div className="header-inner">
        <a className="header-brand" href="#" onClick={(e) => { e.preventDefault(); setActiveStep(0); setNovelInput(''); setScreenplayYaml(''); setStatus(''); setError(''); setAiCharacters(null); setGenerationStats(createEmptyGenerationStats()); aiRunRef.current = ''; }}>
          <div className="header-logo">🎬</div>
          <div>
            <div className="header-title">小说转剧本 YAML</div>
            <div className="header-subtitle">AI 小说转剧本 · 结构化 YAML 导出</div>
          </div>
        </a>
        <button
          className="header-action"
          onClick={activeStep === 3 ? generateYaml : goNext}
          disabled={activeStep < 2 && !canContinue && activeStep !== 0}
          style={activeStep < 2 && !canContinue && activeStep !== 0 ? { background: 'var(--line)', color: '#b0a89c', cursor: 'not-allowed' } : {}}
        >
          {activeStep === 3 ? (aiAvailable ? 'AI 增强生成 YAML' : '生成 YAML') : activeStep === 2 ? (aiAvailable ? 'AI 生成 YAML · 进入导出' : '生成 YAML · 进入导出') : '下一步'}
        </button>
        </div>
      </header>

      <main className="app-layout">
        <aside className="app-sidebar">
          <h2 className="section-title" style={{ marginBottom: 18 }}>创作流程</h2>
          <div className="step-nav">
            {steps.map((step, index) => (
              <button
                key={step.title}
                onClick={() => setActiveStep(index)}
                className={`step-btn${activeStep === index ? ' step-btn--active' : ''}`}
              >
                <span className="step-num">{index + 1}</span>
                <span>
                  <span className="step-text-title">{step.title}</span>
                  <span className="step-text-desc">{step.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="sidebar-settings">
            <div className="sidebar-settings-title">改编设置</div>
            <details className="sidebar-select">
              <summary>
                <span>
                  <small>改编目标</small>
                  <strong>{adaptationTarget.name}</strong>
                </span>
                <b>选择</b>
              </summary>
              <div className="sidebar-select-menu">
                {ADAPTATION_TARGETS.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    className={`sidebar-select-option${adaptationTargetId === target.id ? ' sidebar-select-option--active' : ''}`}
                    onClick={() => {
                      setAdaptationTargetId(target.id);
                      setScreenplayYaml('');
                      setGenerationStats(createEmptyGenerationStats());
                    }}
                  >
                    <span>{target.name}</span>
                    <small>{target.description}</small>
                  </button>
                ))}
              </div>
            </details>

            <details className="sidebar-select">
              <summary>
                <span>
                  <small>改编风格</small>
                  <strong>{adaptationStyle.name}</strong>
                </span>
                <b>选择</b>
              </summary>
              <div className="sidebar-select-menu">
                {ADAPTATION_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className={`sidebar-select-option${adaptationStyleId === style.id ? ' sidebar-select-option--active' : ''}`}
                    onClick={() => {
                      setAdaptationStyleId(style.id);
                      setScreenplayYaml('');
                      setGenerationStats(createEmptyGenerationStats());
                    }}
                  >
                    <span>{style.name}</span>
                    <small>{style.tone}</small>
                  </button>
                ))}
              </div>
            </details>
          </div>

          <div className="status-panel">
            <div className="status-panel-title">当前状态</div>
            {[
              ['AI 状态', aiAvailable ? (aiLoading ? '分析中...' : '🔮 已启用') : '⚠️ 未配置', aiAvailable],
              ['章节数量', `${chapters.length} / 至少 3 章`, canContinue],
              ['人物候选', `${effectiveCharacters.length} 个`, effectiveCharacters.length > 0],
              ['草案场景', `${draftScenes.length} 个`, draftScenes.length > 0],
              ['改编目标', adaptationTarget.shortName, true],
              ['改编风格', adaptationStyle.shortName, true],
              ['生成模式', generationStats.mode === 'idle' ? '待生成' : generationStats.mode === 'local' ? '本地' : generationStats.mode === 'ai' ? 'AI' : '混合', generationStats.mode !== 'idle'],
              ['YAML 初稿', screenplayYaml ? '已生成' : '未生成', Boolean(screenplayYaml)],
            ].map(([label, value, passed]) => (
              <div key={String(label)} className="status-row">
                <span className="status-label">{label}</span>
                <span className={`status-value ${passed ? '--ok' : ''}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="sidebar-note">
            {aiAvailable
              ? '🔮 DeepSeek AI 已启用 · 人物提取与场景分析由 AI 辅助，结果仅供参考。'
              : '未检测到 API Key。请在项目根目录 .env 中配置 VITE_DEEPSEEK_API_KEY，并重启开发服务器。'}
          </div>
        </aside>

        <section className="app-main">
          <div className="main-card fade-in">
            <div className="workspace-ribbon">
              <div>
                <div className="workspace-eyebrow">Novel to Screenplay YAML</div>
                <div className="workspace-title">改编工作台</div>
              </div>
              <div className="workspace-metrics">
                {workbenchMetrics.map((metric) => (
                  <div key={metric.label} className={`workspace-metric workspace-metric--${metric.state}`}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="studio-topline">
              <div>
                <div className="studio-kicker">Screenplay Conversion Workspace</div>
                <h2 className="page-title">
                  <span style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--gold-light)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, marginRight: 14 }}>{activeStep === 0 ? '📥' : activeStep === 1 ? '📚' : activeStep === 2 ? '🎭' : '🧾'}</span>
                  {steps[activeStep].title}
                </h2>
                <p className="page-desc">{steps[activeStep].desc}，最后输出可编辑的 YAML 剧本初稿。</p>
              </div>
              <div className="studio-toolbar">
                {activeStep > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setActiveStep((step) => Math.max(0, step - 1))}>上一步</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => { setNovelInput(''); setScreenplayYaml(''); setStatus(''); setError(''); setImportedFileName(''); setAiCharacters(null); setGenerationStats(createEmptyGenerationStats()); aiRunRef.current = ''; setActiveStep(0); }}>重置</button>
                <button className="btn btn-primary" onClick={activeStep === 3 ? generateYaml : goNext}>{activeStep === 3 ? (aiAvailable ? 'AI 增强重新生成' : '重新生成 YAML') : activeStep === 2 ? (aiAvailable ? 'AI 生成 YAML' : '生成 YAML') : '下一步'}</button>
              </div>
            </div>

            {(status || error) && (
              <div className={`status-toast ${error ? '--error' : '--success'}`}>
                {error || status}
              </div>
            )}

            {renderStepContent()}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
