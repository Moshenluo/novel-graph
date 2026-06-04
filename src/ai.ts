import OpenAI from 'openai';

const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
const baseURL = import.meta.env.VITE_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';

let client: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (!client) {
    if (!apiKey) throw new Error('未配置 VITE_DEEPSEEK_API_KEY，请在 .env 文件中设置 API Key。');
    client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  }
  return client;
};

// 通用调用：带超时 + 重试
async function callDeepSeek(prompt: string, systemPrompt: string, maxTokens = 1024, retries = 2): Promise<string> {
  const openai = getClient();
  for (let i = 0; i <= retries; i += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const response = await openai.chat.completions.create(
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        },
        { signal: controller.signal },
      );
      clearTimeout(timer);
      return response.choices[0]?.message?.content ?? '';
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error('DeepSeek API 调用失败（已重试）');
}

// ─── 文本预处理：截取每章前 N 字，控制 token 消耗 ───

/** 将章节列表预处理为精简文本块，总字数约 ≤ maxChars */
export function preprocessChaptersForCharacters(
  chapters: { title: string; content: string }[],
  maxCharsPerChapter = 600,
): string {
  // 只取前 15 章，每章取前 maxCharsPerChapter 字
  const limited = chapters.slice(0, 15);
  return limited
    .map((ch) => `【${ch.title}】\n${ch.content.slice(0, maxCharsPerChapter)}`)
    .join('\n\n---\n\n');
}

// ─── AI 人物识别 ───

export interface AIPersona {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  motivation: string;
  traits: string[];
}

const SYSTEM_CHARACTER = `你是一个小说人物分析专家。根据用户提供的章节片段，识别所有有名字的角色。
输出严格的 JSON 数组，每个对象含：id（如"char_1"）、name（角色名）、role（protagonist/antagonist/supporting/minor）、motivation（一句话动机）、traits（3个性格标签数组）。
只输出 JSON，不要解释。`;

export async function recognizeCharacters(chaptersText: string): Promise<AIPersona[]> {
  const prompt = `以下是小说若干章节的标题和开头部分：\n\n${chaptersText}\n\n请识别所有有名字的角色，输出 JSON 数组。`;
  const raw = await callDeepSeek(prompt, SYSTEM_CHARACTER, 1536);
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 尝试提取 JSON 数组部分
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

// ─── AI 丰富 YAML 场景描述 ───

const SYSTEM_SCENE = `你是一个专业剧本顾问。根据用户提供的章节正文，生成剧本场景的结构化描述。
输出严格的 JSON 对象，含：summary（80字内的场景摘要）、location（场景地点）、time（时间）、beats（3-5个动作节拍，每个含 action 字段）、mood（场景情绪标签）。
只输出 JSON，不要解释。`;

export interface AISceneDraft {
  summary: string;
  location: string;
  time: string;
  beats: { action: string }[];
  mood: string;
}

export async function enrichScene(chapterTitle: string, chapterContent: string): Promise<AISceneDraft> {
  // 只取前 800 字，控制 token
  const truncated = chapterContent.slice(0, 800);
  const prompt = `章节标题：${chapterTitle}\n\n章节正文（节选）：\n${truncated}\n\n请生成场景结构化描述，输出 JSON。`;
  const raw = await callDeepSeek(prompt, SYSTEM_SCENE, 1024);
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { summary: '', location: '待定', time: '待定', beats: [], mood: '中性' };
  }
}

// ─── AI 丰富对白潜台词 ───

const SYSTEM_DIALOGUE = `你是一个剧本对白专家。根据说话人、对白内容和场景上下文，生成一句潜台词（subtext），揭示角色说这句话时真正想要表达但未明说的意图。
只输出潜台词文本，不超过 30 字，不要解释。`;

export async function enrichDialogue(speaker: string, text: string, context: string): Promise<string> {
  const prompt = `角色「${speaker}」说：「${text}」\n\n场景上下文（节选）：${context.slice(0, 300)}\n\n请给出这句对白的潜台词（subtext），不超过 30 字：`;
  return callDeepSeek(prompt, SYSTEM_DIALOGUE, 128);
}
