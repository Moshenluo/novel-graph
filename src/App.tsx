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

interface ScreenplayCharacter {
  id: string;
  name: string;
  role: CharacterRole;
}

interface CharacterInput {
  name: string;
  role?: string;
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
3. 对每个角色输出：name（原文中的称呼）、role（主角protagonist/重要配角major_supporting/配角supporting/龙套minor）、evidence（一句原文证据，说明你为什么认为这是角色）
4. 按重要程度从高到低排列

输出纯 JSON 数组（不要带 markdown 代码块标记）：
[{"name":"狂人","role":"protagonist","evidence":"...","frequency":15}]`;

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
      return { name: nameMatch?.[1] ?? `角色${i + 1}`, role: 'supporting', evidence: '' };
    });
  }
};

interface AISceneEnrichment {
  location: string;
  time: string;
  summary: string;
  beats: string[];
}

const aiEnrichScene = async (chapter: NovelChapter): Promise<AISceneEnrichment> => {
  const content = chapter.content.slice(0, 3000);

  const systemPrompt = `你是剧本顾问，负责将小说章节转换为剧本场景卡片。

请分析以下文本，输出 JSON：

{
  "location": "场景地点（具体描述，如"江南小城的石板街道"而非"街道"）",
  "time": "时间设定（如"深秋夜晚"、"暮春清晨"）",
  "summary": "场景摘要（2-3句话概括这个场景发生了什么，聚焦戏剧性冲突）",
  "beats": ["动作节拍1：人物做什么", "动作节拍2", "动作节拍3", "动作节拍4", "动作节拍5"]
}

要求：
- beats 输出 3-5 个节拍，每个节拍描述一个具体的戏剧动作或转折
- summary 要突出冲突和张力
- 语言使用流畅中文

输出纯 JSON，不要包裹在 markdown 代码块里。`;

  const result = await callDeepSeek(systemPrompt, `章节：${chapter.title}\n\n${content}`);

  const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? result.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    return {
      location: inferLocation(chapter.content),
      time: inferTime(chapter.content),
      summary: `待AI分析：${compactText(chapter.content, 120)}`,
      beats: chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 5).map((s) => compactText(s.trim(), 110)),
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

const convertNovelToScreenplayYaml = (text: string, characterOverrides?: CharacterInput[]) => {
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
      '      - "检查场景冲突是否足够清晰"',
      '      - "补充镜头调度、人物动作和潜台词"',
    ].join('\n')),
    'adaptation_notes:',
    '  - "本稿为浏览器本地启发式转换结果，不调用外部接口。"',
    '  - "建议作者继续补充人物动机、场景调度和对白节奏。"',
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

function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [novelInput, setNovelInput] = useState('');
  const [screenplayYaml, setScreenplayYaml] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [importedFileName, setImportedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCharacters, setAiCharacters] = useState<{ name: string; role: string }[] | null>(null);
  const [generationStats, setGenerationStats] = useState<GenerationStats>(() => createEmptyGenerationStats());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aiAvailable = getAIStatus() === 'enabled';

  const chapters = useMemo(() => splitNovelChapters(novelInput), [novelInput]);
  const canContinue = chapters.length >= 3;

  // 人物：AI 结果优先，降级到正则
  const effectiveCharacters = useMemo(() => {
    if (aiCharacters && aiCharacters.length > 0) return aiCharacters;
    return extractCharacters(chapters).map((c) => ({ name: c.name, role: c.role }));
  }, [aiCharacters, chapters]);

  const graph = useMemo(() => {
    // 图谱展示候选人物在同一章节内共同出现的线索。
    const characters = effectiveCharacters.map((c, i) => ({
      id: `char_${i + 1}`,
      name: c.name,
      role: c.role,
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
    return { width, height, nodes, edges: [...edgeMap.values()] };
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
      local: '本地候选',
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
        setAiCharacters(chars.map((c) => ({ name: c.name, role: c.role })));
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
      const normalized = chars.map((c) => ({ name: c.name, role: c.role }));
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
            const enrichment = await aiEnrichScene(chapter);
            enrichedScenes.push(enrichment);
            aiSceneCount += 1;
          } catch {
            fallbackSceneCount += 1;
            enrichedScenes.push({
              location: inferLocation(chapter.content),
              time: inferTime(chapter.content),
              summary: compactText(chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 2).join('。'), 120),
              beats: chapter.content.split(/[。！？!?]/).filter(Boolean).slice(0, 5).map((s) => compactText(s.trim(), 110)),
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
            '    motivation: "待作者补充"',
          ].join('\n'))
          : ['  []]'];

        yaml = [
          'schema_version: "1.0"',
          'project:',
          '  title: "小说改编剧本初稿（AI 增强）"',
          '  source_type: "novel"',
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
            '      - "建议补充镜头调度、人物动作和潜台词"',
          ].join('\n')),
          'adaptation_notes:',
          '  - "本稿由 DeepSeek AI 辅助生成，人物提取与场景分析均经 AI 处理。"',
          `  - "AI 场景分析完成 ${aiSceneCount}/${chapters.length} 章，降级 ${fallbackSceneCount} 章。"`,
          '  - "建议作者继续补充人物动机、场景调度和对白节奏。"',
          '  - "AI 建议可能有误，请以作者判断为准。"',
        ].join('\n');
      } else {
        // 无 AI：回退到纯本地启发式
        yaml = convertNovelToScreenplayYaml(novelInput, charactersForYaml);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 0.9fr) minmax(420px, 1.1fr)', gap: 24 }}>
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
            <div className="card">
              <div style={{ fontSize: 32, marginBottom: 12 }}>⌨️</div>
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
            <textarea value={novelInput} onChange={(event) => { setNovelInput(event.target.value); setScreenplayYaml(''); setError(''); setImportedFileName(''); setAiCharacters(null); setGenerationStats(createEmptyGenerationStats()); aiRunRef.current = ''; }} placeholder="在这里粘贴小说文本。请至少包含 3 个章节，例如：第一章、第二章、第三章。" style={{ width: '100%', minHeight: 500, padding: 20, border: `2px solid ${error ? COLORS.danger : COLORS.line}`, borderRadius: 14, resize: 'vertical', fontSize: 15, lineHeight: 1.75, fontFamily: 'Consolas, Menlo, monospace', color: COLORS.ink, background: '#f8fafc' }} />
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {chapters.map((chapter) => (
              <div key={chapter.index} className="card" style={{ padding: 18, border: `1px solid ${COLORS.line}`, borderRadius: 14, background: '#fff' }}>
                <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 950 }}>第 {chapter.index} 章</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 950 }}>{chapter.title}</div>
                <p style={{ color: COLORS.muted, lineHeight: 1.6, minHeight: 46 }}>{compactText(chapter.content, 82)}</p>
                <div style={{ fontSize: 13, color: COLORS.muted }}>字数约 {chapter.content.length}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === 2) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 1fr) 320px', gap: 22 }}>
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
            <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 950 }}>人物共现图谱</h3>
            <div style={{ padding: 16, borderRadius: 14, border: `1px solid ${COLORS.line}`, background: '#fff' }}>
              <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.7 }}>图谱展示人名候选和同章出现线索，不等同于人工确认的角色设定。</div>
              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                {graph.nodes.length === 0 ? <div style={{ color: COLORS.muted }}>暂无人物候选</div> : graph.nodes.slice(0, 8).map((node) => (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 999, background: node.role === 'protagonist' ? COLORS.accent : COLORS.soft, color: node.role === 'protagonist' ? '#fff' : COLORS.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>{node.name.slice(0, 1)}</span>
                    <span style={{ fontWeight: 850 }}>{node.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 1fr) 260px', gap: 22 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 950 }}>YAML 导出</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCopy} disabled={!screenplayYaml} style={{ padding: '9px 13px', border: 'none', borderRadius: 8, background: screenplayYaml ? COLORS.ink : '#e2e8f0', color: screenplayYaml ? '#fff' : COLORS.muted, fontWeight: 850, cursor: screenplayYaml ? 'pointer' : 'not-allowed' }}>复制</button>
              <button onClick={handleDownload} disabled={!screenplayYaml} style={{ padding: '9px 13px', border: 'none', borderRadius: 8, background: screenplayYaml ? COLORS.success : '#e2e8f0', color: screenplayYaml ? '#fff' : COLORS.muted, fontWeight: 850, cursor: screenplayYaml ? 'pointer' : 'not-allowed' }}>下载</button>
            </div>
          </div>
          <pre style={{ minHeight: 560, margin: 0, padding: 20, border: `2px solid ${COLORS.line}`, borderRadius: 14, background: '#0f172a', color: '#e2e8f0', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.65 }}>{screenplayYaml || '点击下方"生成 YAML"后显示结构化剧本初稿。'}</pre>
        </div>
        <div style={{ padding: 18, borderRadius: 14, border: `1px solid ${COLORS.line}`, background: '#fff', alignSelf: 'start' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 950 }}>导出清单</h3>
          {['project 元数据', 'characters 人物候选', 'scenes 场景列表', 'beats 动作节拍', 'dialogue 对白'].map((item) => (
            <div key={item} style={{ padding: '10px 0', borderBottom: `1px solid ${COLORS.line}`, fontSize: 14 }}>✅ {item}</div>
          ))}
          <h3 style={{ margin: '18px 0 10px', fontSize: 18, fontWeight: 950 }}>转换诊断</h3>
          {conversionDiagnostics.map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${COLORS.line}`, fontSize: 13 }}>
              <span style={{ color: COLORS.muted }}>{item.label}</span>
              <span style={{ color: item.ok ? COLORS.success : COLORS.danger, fontWeight: 900 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', color: 'var(--ink)' }}>
      <header className="app-header">
        <div className="header-inner">
        <a className="header-brand" href="#" onClick={(e) => { e.preventDefault(); setActiveStep(0); setNovelInput(''); setScreenplayYaml(''); setStatus(''); setError(''); setAiCharacters(null); setGenerationStats(createEmptyGenerationStats()); aiRunRef.current = ''; }}>
          <div className="header-logo">🎬</div>
          <div>
            <div className="header-title"> novel-graph</div>
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

          <div className="status-panel">
            <div className="status-panel-title">当前状态</div>
            {[
              ['AI 状态', aiAvailable ? (aiLoading ? '分析中...' : '🔮 已启用') : '⚠️ 未配置', aiAvailable],
              ['章节数量', `${chapters.length} / 至少 3 章`, canContinue],
              ['人物候选', `${effectiveCharacters.length} 个`, effectiveCharacters.length > 0],
              ['草案场景', `${draftScenes.length} 个`, draftScenes.length > 0],
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 className="page-title">
                  <span style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--gold-light)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, marginRight: 14 }}>{activeStep === 0 ? '📥' : activeStep === 1 ? '📚' : activeStep === 2 ? '🎭' : '🧾'}</span>
                  {steps[activeStep].title}
                </h2>
                <p className="page-desc">{steps[activeStep].desc}，最后输出可编辑的 YAML 剧本初稿。</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
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
