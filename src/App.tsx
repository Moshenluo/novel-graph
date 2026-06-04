import { useMemo, useRef, useState, useCallback } from 'react';
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

interface GraphNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  count: number;
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
  // 3. 全角空格前缀 + 单个中文数字独占一行 — 覆盖狂人日记"　　一"
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

const extractQuotedDialogue = (content: string): DialogueLine[] => {
  const lines: DialogueLine[] = [];
  const pattern = /([\u4e00-\u9fa5A-Za-z]{2,8})\s*(?:说|问|答道|低声说|回答|喊道|说道|笑道)[：:]\s*[""]([^""]+)[""]?/g;
  for (const match of content.matchAll(pattern)) {
    lines.push({ speaker: match[1], text: match[2].trim() });
  }
  return lines;
};

const extractCharacters = (chapters: NovelChapter[]) => {
  const names = new Map<string, number>();
  chapters.forEach((chapter) => {
    for (const match of chapter.content.matchAll(/([\u4e00-\u9fa5]{2,4})(?:说|问|回答|低声说|喊道|说道|笑道|站|看|握|走|发现|找到|决定)/g)) {
      const name = match[1].replace(/^(清晨|雨水|地下|父亲的|里面|两人|一阵|只有|时候|突然)/, '').trim();
      if (name.length >= 2 && name.length <= 4) names.set(name, (names.get(name) ?? 0) + 1);
    }
  });
  return [...names.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name], index) => ({ id: `char_${index + 1}`, name, role: index === 0 ? 'protagonist' : 'supporting' }));
};

const buildCharacterGraph = (chapters: NovelChapter[]) => {
  const characters = extractCharacters(chapters);
  const width = 820;
  const height = 520;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const nodes: GraphNode[] = characters.map((character, index) => {
    if (index === 0) return { ...character, x: centerX, y: centerY };
    const angle = ((index - 1) / Math.max(characters.length - 1, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...character,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const edgeMap = new Map<string, GraphEdge>();

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
};

const inferLocation = (content: string) => /地下室|密室|书店|钟楼|门口|房间|街道|山谷|城门|屋内|庭院/.exec(content)?.[0] ?? '待定场景';
const inferTime = (content: string) => /清晨|早晨|雨夜|深夜|夜晚|黄昏|午后|傍晚|黎明/.exec(content)?.[0] ?? '待定时间';

const convertNovelToScreenplayYaml = (text: string) => {
  const chapters = splitNovelChapters(text);
  if (chapters.length < 3) {
    throw new Error(`当前识别到 ${chapters.length} 个章节，请至少导入或粘贴 3 个章节。`);
  }

  const characters = extractCharacters(chapters);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chapters = useMemo(() => splitNovelChapters(novelInput), [novelInput]);
  const graph = useMemo(() => buildCharacterGraph(chapters), [chapters]);
  const canContinue = chapters.length >= 3;
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

  const generateYaml = () => {
    const yaml = convertNovelToScreenplayYaml(novelInput);
    setScreenplayYaml(yaml);
    setStatus('已生成剧本 YAML 初稿。');
    return yaml;
  };

  const goNext = () => {
    try {
      setError('');
      if (activeStep === 0 && !canContinue) {
        setError(`当前识别到 ${chapters.length} 个章节，请先导入或粘贴至少 3 个章节。`);
        return;
      }
      if (activeStep === 2) generateYaml();
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
            <textarea value={novelInput} onChange={(event) => { setNovelInput(event.target.value); setScreenplayYaml(''); setError(''); setImportedFileName(''); }} placeholder="在这里粘贴小说文本。请至少包含 3 个章节，例如：第一章、第二章、第三章。" style={{ width: '100%', minHeight: 500, padding: 20, border: `2px solid ${error ? COLORS.danger : COLORS.line}`, borderRadius: 14, resize: 'vertical', fontSize: 15, lineHeight: 1.75, fontFamily: 'Consolas, Menlo, monospace', color: COLORS.ink, background: '#f8fafc' }} />
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
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', color: 'var(--ink)' }}>
      <header className="app-header">
        <div className="header-inner">
        <a className="header-brand" href="#" onClick={(e) => { e.preventDefault(); setActiveStep(0); setNovelInput(''); setScreenplayYaml(''); setStatus(''); setError(''); }}>
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
          {activeStep === 3 ? '生成 YAML' : activeStep === 2 ? '生成 YAML · 进入导出' : '下一步'}
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
              ['章节数量', `${chapters.length} / 至少 3 章`, canContinue],
              ['人物候选', `${graph.nodes.length} 个`, graph.nodes.length > 0],
              ['草案场景', `${draftScenes.length} 个`, draftScenes.length > 0],
              ['YAML 初稿', screenplayYaml ? '已生成' : '未生成', Boolean(screenplayYaml)],
            ].map(([label, value, passed]) => (
              <div key={String(label)} className="status-row">
                <span className="status-label">{label}</span>
                <span className={`status-value ${passed ? '--ok' : ''}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="sidebar-note">
            本工具只在浏览器本地解析文本，不调用外部接口。人物共现只作为参考线索。
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
                <button className="btn btn-ghost btn-sm" onClick={() => { setNovelInput(''); setScreenplayYaml(''); setStatus(''); setError(''); setImportedFileName(''); setActiveStep(0); }}>重置</button>
                <button className="btn btn-primary" onClick={activeStep === 3 ? generateYaml : goNext}>{activeStep === 3 ? '重新生成 YAML' : activeStep === 2 ? '生成 YAML' : '下一步'}</button>
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
