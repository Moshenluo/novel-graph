import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, useNodesState, useEdgesState, addEdge, MarkerType, ConnectionLineType } from '@xyflow/react';
import type { Connection, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import html2canvas from 'html2canvas';

// ========== 类型定义 ==========
type NodeType = 'character' | 'organization' | 'force' | 'location';
type ViewMode = 'graph' | 'timeline' | 'world' | 'outline' | 'panorama' | 'inspiration' | 'rules' | 'map' | 'items';

interface Character { id: string; name: string; description?: string; age?: string; gender?: string; organizationId?: string; forceId?: string; itemIds: string[]; relationships: { targetId: string; type: string }[]; }
interface Organization { id: string; name: string; description?: string; leaderId?: string; members: string[]; }
interface Force { id: string; name: string; description?: string; leaderId?: string; members: string[]; }
interface Item { id: string; name: string; type: string; description?: string; power?: string; ownerId?: string; }
interface WorldRule { id: string; category: string; name: string; description: string; }
interface Location { id: string; name: string; type: string; description?: string; relatedLocations: string[]; }
interface TimelineEvent { id: string; title: string; description?: string; startTime: string; participants: string[]; }
interface CustomRelation { id: string; label: string; icon: string; color: string; description?: string; }

interface NodeData { label: string; nodeType: NodeType; description?: string; [key: string]: any; }

// ========== 设计系统 ==========
const COLORS = {
  character: { main: '#6366f1', light: '#e0e7ff', gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' },
  organization: { main: '#10b981', light: '#d1fae5', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  force: { main: '#ef4444', light: '#fee2e2', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
  location: { main: '#f59e0b', light: '#fef3c7', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
  neutral: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b' },
};

const RADIUS = { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 };
const SHADOWS = { md: '0 2px 4px rgba(0,0,0,0.06)', lg: '0 4px 12px rgba(0,0,0,0.08)' };

const PRESET_RELATIONS = [
  { type: 'blood', label: '血缘', icon: '❤️', color: '#ef4444' },
  { type: 'master', label: '师徒', icon: '🎓', color: '#10b981' },
  { type: 'enemy', label: '敌对', icon: '⚔️', color: '#ef4444' },
  { type: 'ally', label: '盟友', icon: '🤝', color: '#3b82f6' },
  { type: 'love', label: '情感', icon: '💕', color: '#ec4899' },
  { type: 'belong', label: '所属', icon: '🏛️', color: '#10b981' },
  { type: 'locate', label: '位于', icon: '📍', color: '#f59e0b' },
  { type: 'friend', label: '好友', icon: '👫', color: '#8b5cf6' },
  { type: 'rival', label: '竞争对手', icon: '🏆', color: '#f59e0b' },
  { type: 'creator', label: '创造', icon: '✨', color: '#06b6d4' },
];

// ========== 自定义节点组件 ==========
const CustomNode = ({ id, data, selected }: { id: string; data: NodeData; selected?: boolean }) => {
  const colors = COLORS[data.nodeType as NodeType] || COLORS.character;
  const icons = { character: '👤', organization: '🏛️', force: '⚔️', location: '📍' };
  
  const handleConnectionStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const event = new CustomEvent('start-drag-connection', { 
      detail: { 
        nodeId: id, 
        x: e.clientX, 
        y: e.clientY,
        nodeX: rect.left + rect.width / 2,
        nodeY: rect.top + rect.height / 2
      }, 
      bubbles: true 
    });
    window.dispatchEvent(event);
  };
  
  return (
    <div style={{ padding: '14px 18px', background: colors.light, border: `3px solid ${selected ? colors.main : colors.main}`, borderRadius: RADIUS.lg, minWidth: 150, boxShadow: selected ? SHADOWS.lg : SHADOWS.md, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} data-node-id={id}>
      <div 
        onMouseDown={handleConnectionStart}
        style={{ 
          position: 'absolute', 
          top: '50%', 
          right: -12, 
          transform: 'translateY(-50%)',
          width: 24, 
          height: 24, 
          borderRadius: RADIUS.full, 
          background: colors.main, 
          color: '#fff', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: 14, 
          cursor: 'grab', 
          boxShadow: SHADOWS.md, 
          transition: 'all 0.2s', 
          zIndex: 10,
          userSelect: 'none',
        }} 
        title="拖拽到另一个节点建立关系"
      >
        🔗
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 24 }}>{icons[data.nodeType as NodeType] || '👤'}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: colors.main, textTransform: 'uppercase', background: '#fff', padding: '3px 8px', borderRadius: RADIUS.sm }}>{data.nodeType}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.neutral[800], wordBreak: 'break-word' }}>{data.label}</div>
      {data.description && <div style={{ fontSize: 11, color: COLORS.neutral[500], marginTop: 6, lineHeight: 1.4 }}>{data.description.substring(0, 60)}...</div>}
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

// ========== 主组件 ==========
function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]) as any;
  const [edges, setEdges, onEdgesChange] = useEdgesState([]) as any;
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTarget, setAiTarget] = useState<'character' | 'location' | 'event'>('character');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [dragConnection, setDragConnection] = useState<{ source: string; startX: number; startY: number; currX: number; currY: number } | null>(null);
  const [showRelationPanel, setShowRelationPanel] = useState<{ source: string; target: string } | null>(null);
  const [showCustomRelation, setShowCustomRelation] = useState(false);
  const [customRelations, setCustomRelations] = useState<CustomRelation[]>([]);
  const [newRelation, setNewRelation] = useState<CustomRelation>({ id: '', label: '', icon: '🔗', color: '#6366f1', description: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<NodeType | 'all'>('all');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [forces, setForces] = useState<Force[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [worldRules, setWorldRules] = useState<WorldRule[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editingRule, setEditingRule] = useState<WorldRule | null>(null);
  const [editingEdge, setEditingEdge] = useState<any>(null);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('novel-graph-data');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
        if (data.characters) setCharacters(data.characters);
        if (data.organizations) setOrganizations(data.organizations);
        if (data.forces) setForces(data.forces);
        if (data.items) setItems(data.items);
        if (data.worldRules) setWorldRules(data.worldRules);
        if (data.locations) setLocations(data.locations);
        if (data.events) setEvents(data.events);
        if (data.customRelations) setCustomRelations(data.customRelations);
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('novel-graph-data', JSON.stringify({ nodes, edges, characters, organizations, forces, items, worldRules, locations, events, customRelations }));
  }, [nodes, edges, characters, organizations, forces, items, worldRules, locations, events, customRelations]);

  const pushHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [nodes, edges, history, historyIndex]);

  const undo = () => { if (historyIndex > 0) { const prev = history[historyIndex - 1]; setNodes(prev.nodes); setEdges(prev.edges); setHistoryIndex(historyIndex - 1); } };
  const redo = () => { if (historyIndex < history.length - 1) { const next = history[historyIndex + 1]; setNodes(next.nodes); setEdges(next.edges); setHistoryIndex(historyIndex + 1); } };

  const onConnect = useCallback((params: Connection) => {
    pushHistory();
    const newEdge: any = { ...params, type: 'smoothstep', animated: true, style: { stroke: COLORS.neutral[500], strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color: COLORS.neutral[500] }, data: { relationType: 'default' } };
    setEdges((eds: any) => addEdge(newEdge, eds));
  }, [pushHistory]);

  const handleAddNode = useCallback((label: string, nodeType: NodeType, position?: { x: number; y: number }) => {
    if (!label.trim()) return;
    pushHistory();
    const newNode: any = { id: Date.now().toString(), type: 'custom', position: position || { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 }, data: { label: label.trim(), nodeType } };
    setNodes((nds: any) => [...nds, newNode]);
    if (nodeType === 'character') setCharacters(chars => [...chars, { id: newNode.id, name: label.trim(), description: '', age: '', gender: '', organizationId: '', forceId: '', itemIds: [], relationships: [] }]);
    else if (nodeType === 'organization') setOrganizations(orgs => [...orgs, { id: newNode.id, name: label.trim(), description: '', leaderId: '', members: [] }]);
    else if (nodeType === 'force') setForces(fs => [...fs, { id: newNode.id, name: label.trim(), description: '', leaderId: '', members: [] }]);
    else if (nodeType === 'location') setLocations(locs => [...locs, { id: newNode.id, name: label.trim(), type: 'region', description: '', relatedLocations: [] }]);
  }, [pushHistory]);

  const handleDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => { setIsDragOver(false); }, []);
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!reactFlowWrapper.current) return;
    const type = event.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const x = event.clientX - bounds.left - 60;
    const y = event.clientY - bounds.top - 30;
    handleAddNode(`新${type === 'character' ? '人物' : type === 'organization' ? '组织' : type === 'force' ? '势力' : '地点'}`, type, { x, y });
  }, [handleAddNode]);

  // 拖拽连线事件监听
  useEffect(() => {
    const handleStartDrag = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; x: number; y: number; nodeX: number; nodeY: number };
      setDragConnection({
        source: detail.nodeId,
        startX: detail.nodeX,
        startY: detail.nodeY,
        currX: detail.x,
        currY: detail.y,
      });
    };
    
    const handleDragMove = (e: MouseEvent) => {
      if (!dragConnection) return;
      const rect = reactFlowWrapper.current?.getBoundingClientRect();
      if (rect) {
        setDragConnection(prev => prev ? { ...prev, currX: e.clientX - (rect?.left || 0), currY: e.clientY - (rect?.top || 0) } : null);
      }
    };
    
    const handleDragEnd = (e: MouseEvent) => {
      if (!dragConnection) return;
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const nodeElement = elements.find(el => el.getAttribute('data-node-id'));
      if (nodeElement) {
        const targetId = nodeElement.getAttribute('data-node-id');
        if (targetId && targetId !== dragConnection.source) {
          setShowRelationPanel({ source: dragConnection.source, target: targetId });
        }
      }
      setDragConnection(null);
    };
    
    window.addEventListener('start-drag-connection', handleStartDrag as EventListener);
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    
    return () => {
      window.removeEventListener('start-drag-connection', handleStartDrag as EventListener);
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [dragConnection]);

  const handleNodeClick = useCallback((_: any, node: any) => {
    // 连线模式：选择目标节点
    if (connectionSource && connectionSource !== node.id) {
      setShowRelationPanel({ source: connectionSource, target: node.id });
      setConnectionSource(null);
      return;
    }
    // 普通模式：选择/编辑节点
    setSelectedNode(node);
    const char = characters.find(c => c.id === node.id);
    const org = organizations.find(o => o.id === node.id);
    const force = forces.find(f => f.id === node.id);
    const loc = locations.find(l => l.id === node.id);
    if (char) { setEditingItem({ type: 'character', data: char }); setEditForm(char); }
    else if (org) { setEditingItem({ type: 'organization', data: org }); setEditForm(org); }
    else if (force) { setEditingItem({ type: 'force', data: force }); setEditForm(force); }
    else if (loc) { setEditingItem({ type: 'location', data: loc }); setEditForm(loc); }
  }, [characters, organizations, forces, locations, connectionSource]);

  const handleEdgeClick = useCallback((_: any, edge: any) => { setEditingEdge(edge); }, []);

  const handleAddRelation = (relationType: string, customLabel?: string, customIcon?: string, customColor?: string) => {
    if (!showRelationPanel) return;
    pushHistory();
    const preset = PRESET_RELATIONS.find(r => r.type === relationType);
    const custom = customRelations.find(r => r.id === relationType);
    const color = customColor || custom?.color || preset?.color || COLORS.neutral[500];
    const label = customLabel || custom?.label || preset?.label || relationType;
    const newEdge: any = { id: `e-${Date.now()}`, source: showRelationPanel.source, target: showRelationPanel.target, type: 'smoothstep', animated: true, style: { stroke: color, strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color }, data: { relationType, label } };
    setEdges((eds: any) => [...eds, newEdge]);
    setShowRelationPanel(null);
    const sourceChar = characters.find(c => c.id === showRelationPanel.source);
    if (sourceChar) setCharacters(chars => chars.map(c => c.id === showRelationPanel.source ? { ...c, relationships: [...c.relationships, { targetId: showRelationPanel.target, type: relationType }] } : c));
  };

  const handleDeleteNode = (nodeId: string) => {
    pushHistory();
    setNodes((nds: any) => nds.filter((n: any) => n.id !== nodeId));
    setEdges((eds: any) => eds.filter((e: any) => e.source !== nodeId && e.target !== nodeId));
    setCharacters(chars => chars.filter(c => c.id !== nodeId));
    setOrganizations(orgs => orgs.filter(o => o.id !== nodeId));
    setForces(fs => fs.filter(f => f.id !== nodeId));
    setLocations(locs => locs.filter(l => l.id !== nodeId));
    setSelectedNode(null);
    setEditingItem(null);
  };

  const handleDeleteEdge = (edgeId: string) => { pushHistory(); setEdges((eds: any) => eds.filter((e: any) => e.id !== edgeId)); setEditingEdge(null); };

  const handleClearCanvas = () => {
    if (!confirm('确定清空所有节点和数据？此操作不可恢复！')) return;
    pushHistory();
    setNodes([]); setEdges([]); setCharacters([]); setOrganizations([]); setForces([]); setItems([]); setLocations([]);
    setSelectedNode(null); setEditingItem(null);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    if (editingItem.type === 'character') {
      setCharacters(chars => chars.map(c => c.id === editForm.id ? { ...c, ...editForm } : c));
      setNodes((nds: any) => nds.map((n: any) => n.id === editForm.id ? { ...n, data: { ...n.data, label: editForm.name, description: editForm.description } } : n));
    } else if (editingItem.type === 'organization') {
      setOrganizations(orgs => orgs.map(o => o.id === editForm.id ? { ...o, ...editForm } : o));
      setNodes((nds: any) => nds.map((n: any) => n.id === editForm.id ? { ...n, data: { ...n.data, label: editForm.name, description: editForm.description } } : n));
    } else if (editingItem.type === 'force') {
      setForces(fs => fs.map(f => f.id === editForm.id ? { ...f, ...editForm } : f));
      setNodes((nds: any) => nds.map((n: any) => n.id === editForm.id ? { ...n, data: { ...n.data, label: editForm.name, description: editForm.description } } : n));
    } else if (editingItem.type === 'location') {
      setLocations(locs => locs.map(l => l.id === editForm.id ? { ...l, ...editForm } : l));
      setNodes((nds: any) => nds.map((n: any) => n.id === editForm.id ? { ...n, data: { ...n.data, label: editForm.name, description: editForm.description } } : n));
    } else if (editingItem.type === 'item') {
      setItems(its => its.map(i => i.id === editForm.id ? { ...i, ...editForm } : i));
    }
    setEditingItem(null);
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-xyfitmtiyyusesnnjfmklttvgractfyrnbgmmtwcmxdxjlzy' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-R1',
          messages: [{ role: 'system', content: aiTarget === 'character' ? '生成 3-5 个人物，JSON：[{"name": "姓名", "description": "简介", "age": "年龄", "gender": "性别"}]' : aiTarget === 'location' ? '生成 3-5 个地点，JSON：[{"name": "地名", "description": "描述"}]' : '生成 3-5 个事件，JSON：[{"title": "事件名", "description": "描述"}]' }, { role: 'user', content: aiPrompt }],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        items.forEach((item: any, idx: number) => {
          if (aiTarget === 'character') handleAddNode(item.name, 'character', { x: 100 + (idx % 3) * 200, y: 100 + Math.floor(idx / 3) * 150 });
        });
        alert(`✅ AI 生成了 ${items.length} 个${aiTarget === 'character' ? '人物' : aiTarget === 'location' ? '地点' : '事件'}！`);
        setAiPrompt('');
      }
    } catch (error) { alert('❌ AI 生成失败'); }
    finally { setAiLoading(false); }
  };

  const handleAddCustomRelation = () => {
    if (!newRelation.label.trim()) return;
    const relation: CustomRelation = { ...newRelation, id: `custom-${Date.now()}` };
    setCustomRelations(rels => [...rels, relation]);
    setNewRelation({ id: '', label: '', icon: '🔗', color: '#6366f1', description: '' });
    setShowCustomRelation(false);
  };

  const handleGenerateMap = async () => {
    if (!aiPrompt.trim()) { alert('请输入世界描述'); return; }
    setAiLoading(true);
    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-xyfitmtiyyusesnnjfmklttvgractfyrnbgmmtwcmxdxjlzy' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-R1',
          messages: [{ role: 'system', content: '根据世界描述生成 5-8 个国家/地区，使用不规则多边形模拟真实国境线。返回 JSON：[{"name": "国名", "capital": "首都", "desc": "描述", "color": "柔和的颜色代码", "points": [[x1,y1],[x2,y2],...]}]。points 数组需要 8-12 个点形成不规则闭合多边形，坐标范围 0-1000 x 0-600' }, { role: 'user', content: aiPrompt }],
          temperature: 0.7,
          max_tokens: 2500,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const countries = JSON.parse(jsonMatch[0]);
        setLocations(locs => countries.map((c: any, i: number) => ({ id: Date.now().toString() + i, name: c.name, type: 'country', description: c.desc, relatedLocations: [] })));
        (window as any).__mapCountries = countries;
        alert(`✅ 生成了 ${countries.length} 个国家！`);
      }
    } catch { alert('生成失败'); }
    finally { setAiLoading(false); }
  };

  const handleAddItem = () => { const newItem: Item = { id: Date.now().toString(), name: '新物品', type: 'weapon', description: '', power: '' }; setItems(its => [...its, newItem]); setEditingItem({ type: 'item', data: newItem }); setEditForm(newItem); };
  const handleDeleteItem = (itemId: string) => { setItems(its => its.filter(i => i.id !== itemId)); setCharacters(chars => chars.map(c => ({ ...c, itemIds: c.itemIds.filter(id => id !== itemId) }))); };

  const filteredNodes = useMemo(() => {
    return nodes.filter((node: any) => {
      const matchesSearch = node.data?.label?.toLowerCase().includes(searchQuery.toLowerCase()) || node.data?.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || node.data?.nodeType === filterType;
      return matchesSearch && matchesType;
    });
  }, [nodes, searchQuery, filterType]);

  const exportData = () => {
    const data = { nodes, edges, characters, organizations, forces, items, worldRules, locations, events, customRelations };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novel-graph-${Date.now()}.json`;
    a.click();
  };

  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
        if (data.characters) setCharacters(data.characters);
        if (data.items) setItems(data.items);
        if (data.customRelations) setCustomRelations(data.customRelations);
        alert('✅ 导入成功！');
      } catch { alert('❌ 导入失败'); }
    };
    reader.readAsText(file);
  };

  const exportImage = async () => {
    const element = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!element) return;
    const canvas = await html2canvas(element, { backgroundColor: '#f8fafc' });
    const link = document.createElement('a');
    link.download = `novel-graph-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const nodeTypeOptions = [
    { id: 'character' as NodeType, label: '人物', icon: '👤', color: COLORS.character.gradient, count: nodes.filter((n: any) => n.data?.nodeType === 'character').length },
    { id: 'organization' as NodeType, label: '组织', icon: '🏛️', color: COLORS.organization.gradient, count: nodes.filter((n: any) => n.data?.nodeType === 'organization').length },
    { id: 'force' as NodeType, label: '势力', icon: '⚔️', color: COLORS.force.gradient, count: nodes.filter((n: any) => n.data?.nodeType === 'force').length },
    { id: 'location' as NodeType, label: '地点', icon: '📍', color: COLORS.location.gradient, count: nodes.filter((n: any) => n.data?.nodeType === 'location').length },
  ];

  return (
    <ReactFlowProvider>
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: `linear-gradient(180deg, ${COLORS.neutral[50]} 0%, ${COLORS.neutral[100]} 100%)` }}>
        
        <header style={{ height: 64, background: '#fff', borderBottom: `1px solid ${COLORS.neutral[200]}`, display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between', boxShadow: SHADOWS.md, zIndex: 1000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: RADIUS.md, cursor: 'pointer', fontSize: 18 }}>{sidebarOpen ? '◀' : '▶'}</button>
            <div style={{ width: 40, height: 40, borderRadius: RADIUS.lg, background: COLORS.character.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📚</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.neutral[800] }}>小说智能图谱</div>
              <div style={{ fontSize: 11, color: COLORS.neutral[400] }}>v4.2 · 搜索 + 关系编辑 + 物品管理</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={undo} disabled={historyIndex <= 0} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: historyIndex <= 0 ? COLORS.neutral[100] : '#fff', border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer', fontSize: 16 }}>↩️</button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: historyIndex >= history.length - 1 ? COLORS.neutral[100] : '#fff', border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer', fontSize: 16 }}>↪️</button>
            <div style={{ width: 1, height: 24, background: COLORS.neutral[200], margin: '0 8px', alignSelf: 'center' }} />
            {['graph', 'map', 'items', 'inspiration', 'timeline', 'world', 'rules', 'outline', 'panorama'].map((mode, idx) => (
              <button key={mode} onClick={() => setViewMode(mode as ViewMode)} style={{ padding: '8px 12px', border: 'none', background: viewMode === mode ? COLORS.neutral[800] : 'transparent', color: viewMode === mode ? '#fff' : COLORS.neutral[600], borderRadius: RADIUS.md, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{['📊', '🗺️', '🎒', '💡', '📅', '🌍', '📜', '📝', '📊'][idx]}</button>
            ))}
            <div style={{ width: 1, height: 24, background: COLORS.neutral[200], margin: '0 8px', alignSelf: 'center' }} />
            <button onClick={exportData} style={{ padding: '8px 12px', background: '#fff', border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>💾</button>
            <button onClick={() => document.getElementById('import-file')?.click()} style={{ padding: '8px 12px', background: '#fff', border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>📂</button>
            <button onClick={exportImage} style={{ padding: '8px 12px', background: '#fff', border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>📸</button>
            <input id="import-file" type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) importData(file); }} />
          </div>
        </header>
        
        <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          
          {sidebarOpen && (
            <aside style={{ width: 300, background: '#fff', borderRight: `1px solid ${COLORS.neutral[200]}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto' }}>
              
              {viewMode === 'graph' && (
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12, textTransform: 'uppercase' }}>🔍 搜索与筛选</h3>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索人物/地点..." style={{ width: '100%', padding: 10, border: `2px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button onClick={() => setFilterType('all')} style={{ flex: 1, padding: '6px 8px', border: 'none', borderRadius: RADIUS.sm, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filterType === 'all' ? COLORS.neutral[800] : COLORS.neutral[100], color: filterType === 'all' ? '#fff' : COLORS.neutral[600] }}>全部</button>
                    {(['character', 'organization', 'force', 'location'] as const).map(type => (
                      <button key={type} onClick={() => setFilterType(type)} style={{ flex: 1, padding: '6px 8px', border: 'none', borderRadius: RADIUS.sm, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filterType === type ? COLORS[type].main : COLORS.neutral[100], color: filterType === type ? '#fff' : COLORS.neutral[600] }}>{{character: '👤', organization: '🏛️', force: '⚔️', location: '📍'}[type]}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.neutral[400], marginTop: 4 }}>显示 {filteredNodes.length} / {nodes.length} 个节点</div>
                </div>
              )}
              
              <div style={{ height: 1, background: COLORS.neutral[100] }} />
              
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12, textTransform: 'uppercase' }}>🎯 拖拽添加</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {nodeTypeOptions.map(type => (
                    <div key={type.id} draggable onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', type.id); }} style={{ padding: 12, background: type.color, borderRadius: RADIUS.lg, cursor: 'grab', color: '#fff', boxShadow: SHADOWS.md }}>
                      <div style={{ fontSize: 20 }}>{type.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{type.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.9 }}>{type.count} 个</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div style={{ height: 1, background: COLORS.neutral[100] }} />
              
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12 }}>🔗 快捷连线</h3>
                <div style={{ padding: 12, background: dragConnection ? COLORS.character.light : COLORS.neutral[50], borderRadius: RADIUS.md, fontSize: 12, color: COLORS.neutral[600], lineHeight: 1.6, border: dragConnection ? `2px solid ${COLORS.character.main}` : 'none' }}>
                  {dragConnection ? (<div style={{ color: COLORS.character.main, fontWeight: 700 }}>🎯 正在连线... 松开鼠标到目标节点</div>) : (<><div style={{ marginBottom: 8 }}>1️⃣ 从节点右侧的 <strong>🔗</strong> 按钮拖拽</div><div style={{ marginBottom: 8 }}>2️⃣ 拉到另一个节点</div><div>3️⃣ 松开鼠标选择关系类型</div></>)}
                </div>
              </div>
              
              <div style={{ height: 1, background: COLORS.neutral[100] }} />
              
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12 }}>✏️ 自定义关系</h3>
                <button onClick={() => setShowCustomRelation(true)} style={{ width: '100%', padding: 10, background: COLORS.character.main, color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>➕ 添加关系类型</button>
                {customRelations.length > 0 && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{customRelations.map(rel => (<span key={rel.id} style={{ fontSize: 11, padding: '4px 8px', background: rel.color + '20', color: rel.color, borderRadius: RADIUS.sm }}>{rel.icon} {rel.label}</span>))}</div>)}
              </div>
              
              <div style={{ height: 1, background: COLORS.neutral[100] }} />
              
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12, textTransform: 'uppercase' }}>💡 AI 灵感生成</h3>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>{(['character', 'location', 'event'] as const).map(t => (<button key={t} onClick={() => setAiTarget(t)} style={{ flex: 1, padding: '6px 8px', border: 'none', borderRadius: RADIUS.sm, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: aiTarget === t ? COLORS.character.main : COLORS.neutral[100], color: aiTarget === t ? '#fff' : COLORS.neutral[600] }}>{t === 'character' ? '👤' : t === 'location' ? '📍' : '📅'}</button>))}</div>
                <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="描述你的灵感..." style={{ width: '100%', height: 60, padding: 8, border: `2px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, fontSize: 12, resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }} />
                <button onClick={handleAiGenerate} disabled={!aiPrompt.trim() || aiLoading} style={{ width: '100%', padding: 10, background: !aiPrompt.trim() || aiLoading ? COLORS.neutral[200] : COLORS.character.gradient, color: !aiPrompt.trim() || aiLoading ? COLORS.neutral[400] : '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: !aiPrompt.trim() || aiLoading ? 'not-allowed' : 'pointer' }}>{aiLoading ? '⏳' : '✨ AI 生成'}</button>
              </div>
              
              <div style={{ height: 1, background: COLORS.neutral[100] }} />
              
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12 }}>📊 统计</h3>
                {nodeTypeOptions.map(type => (<div key={type.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: COLORS.neutral[50], borderRadius: RADIUS.md, marginBottom: 6 }}><span style={{ fontSize: 12, color: COLORS.neutral[600] }}>{type.icon} {type.label}</span><span style={{ fontSize: 14, fontWeight: 700, color: COLORS.neutral[700] }}>{type.count}</span></div>))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: COLORS.neutral[50], borderRadius: RADIUS.md }}><span style={{ fontSize: 12, color: COLORS.neutral[600] }}>🔗 关系</span><span style={{ fontSize: 14, fontWeight: 700, color: COLORS.neutral[700] }}>{edges.length}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: COLORS.neutral[50], borderRadius: RADIUS.md }}><span style={{ fontSize: 12, color: COLORS.neutral[600] }}>🎒 物品</span><span style={{ fontSize: 14, fontWeight: 700, color: COLORS.neutral[700] }}>{items.length}</span></div>
              </div>
              
              <div style={{ height: 1, background: COLORS.neutral[100] }} />
              
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 12 }}>⚡ 快捷操作</h3>
                {selectedNode && (<button onClick={() => handleDeleteNode(selectedNode.id)} style={{ width: '100%', padding: 10, marginBottom: 8, background: COLORS.force.light, color: COLORS.force.main, border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer' }}>🗑️ 删除选中节点</button>)}
                <button onClick={handleClearCanvas} style={{ width: '100%', padding: 10, background: COLORS.neutral[200], color: COLORS.neutral[600], border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer' }}>🗑️ 清空画布</button>
              </div>
            </aside>
          )}
          
          {viewMode === 'graph' && (
            <div ref={reactFlowWrapper} style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, overflow: 'hidden', position: 'relative' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              {isDragOver && (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(99, 102, 241, 0.1)', border: `2px dashed ${COLORS.character.main}`, borderRadius: RADIUS.xl, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 100 }}><div style={{ fontSize: 18, fontWeight: 700, color: COLORS.character.main, background: '#fff', padding: '12px 24px', borderRadius: RADIUS.lg, boxShadow: SHADOWS.lg }}>🎯 松开鼠标添加节点</div></div>)}
              {/* 拖拽连线视觉反馈 */}
              {dragConnection && (
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}>
                  <path
                    d={`M ${dragConnection.startX} ${dragConnection.startY} C ${(dragConnection.startX + dragConnection.currX) / 2} ${dragConnection.startY}, ${(dragConnection.startX + dragConnection.currX) / 2} ${dragConnection.currY}, ${dragConnection.currX} ${dragConnection.currY}`}
                    stroke={COLORS.character.main}
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead-drag)"
                  />
                  <defs>
                    <marker id="arrowhead-drag" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill={COLORS.character.main} />
                    </marker>
                  </defs>
                </svg>
              )}
              <ReactFlow nodes={filteredNodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={handleNodeClick} onEdgeClick={handleEdgeClick} nodeTypes={nodeTypes} fitView style={{ background: 'transparent' }} connectionLineType={ConnectionLineType.SmoothStep}>
                <Background color={COLORS.neutral[300]} gap={20} size={1} />
                <Controls />
              </ReactFlow>
            </div>
          )}
          
          {viewMode === 'items' && (
            <div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32, overflow: 'auto' }}>
              <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div><h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.location.main, marginBottom: 8 }}>🎒 物品管理</h2><p style={{ color: COLORS.neutral[400] }}>管理武器、法宝、材料、功法等物品</p></div>
                  <button onClick={handleAddItem} style={{ padding: '12px 24px', background: COLORS.location.gradient, color: '#fff', border: 'none', borderRadius: RADIUS.lg, fontWeight: 700, cursor: 'pointer', boxShadow: SHADOWS.lg }}>➕ 添加物品</button>
                </div>
                {items.length === 0 ? (<div style={{ textAlign: 'center', padding: 64, background: COLORS.neutral[50], borderRadius: RADIUS.xl }}><div style={{ fontSize: 64, marginBottom: 16 }}>🎒</div><div style={{ fontSize: 16, fontWeight: 600, color: COLORS.neutral[600] }}>暂无物品</div><div style={{ color: COLORS.neutral[400], marginTop: 8 }}>点击右上角添加物品</div></div>) : (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>{items.map(item => (<div key={item.id} onClick={() => { setEditingItem({ type: 'item', data: item }); setEditForm(item); }} style={{ padding: 20, background: COLORS.neutral[50], borderRadius: RADIUS.lg, border: `2px solid ${COLORS.neutral[200]}`, cursor: 'pointer', transition: 'all 0.2s' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}><div><div style={{ fontSize: 12, color: COLORS.location.main, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{item.type}</div><div style={{ fontSize: 18, fontWeight: 700, color: COLORS.neutral[800] }}>{item.name}</div></div><button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: COLORS.neutral[400], padding: 4 }}>🗑️</button></div>{item.description && <div style={{ fontSize: 13, color: COLORS.neutral[600], marginBottom: 8, lineHeight: 1.5 }}>{item.description}</div>}{item.power && <div style={{ fontSize: 12, color: COLORS.force.main, fontWeight: 600 }}>⚡ {item.power}</div>}{item.ownerId && (() => { const owner = characters.find(c => c.id === item.ownerId); return owner ? <div style={{ fontSize: 12, color: COLORS.neutral[500], marginTop: 8 }}>👤 拥有者：{owner.name}</div> : null; })()}</div>))}</div>)}
              </div>
            </div>
          )}
          
          {showRelationPanel && (
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: RADIUS.xl, boxShadow: SHADOWS.lg, padding: 24, zIndex: 2000, minWidth: 350, maxHeight: 500, overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🔗 选择关系类型</h3><button onClick={() => setShowRelationPanel(null)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>{PRESET_RELATIONS.map(rel => (<button key={rel.type} onClick={() => handleAddRelation(rel.type)} style={{ padding: 12, border: `2px solid ${rel.color}`, borderRadius: RADIUS.md, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}><span style={{ fontSize: 18 }}>{rel.icon}</span><span style={{ fontSize: 13, fontWeight: 600, color: rel.color }}>{rel.label}</span></button>))}</div>
              {customRelations.length > 0 && (<><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.neutral[600], marginBottom: 8, textTransform: 'uppercase' }}>自定义关系</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{customRelations.map(rel => (<button key={rel.id} onClick={() => handleAddRelation(rel.id, rel.label, rel.icon, rel.color)} style={{ padding: 12, border: `2px solid ${rel.color}`, borderRadius: RADIUS.md, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{rel.icon}</span><span style={{ fontSize: 13, fontWeight: 600, color: rel.color }}>{rel.label}</span></button>))}</div></>)}
            </div>
          )}
          
          {showCustomRelation && (
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: RADIUS.xl, boxShadow: SHADOWS.lg, padding: 24, zIndex: 2000, width: 400 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>✏️ 添加自定义关系</h3><button onClick={() => { setShowCustomRelation(false); setNewRelation({ id: '', label: '', icon: '🔗', color: '#6366f1', description: '' }); }} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div>
              <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>关系名称</label><input value={newRelation.label} onChange={(e) => setNewRelation({ ...newRelation, label: e.target.value })} placeholder="如：结拜兄弟" style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }} /></div>
              <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>图标 Emoji</label><input value={newRelation.icon} onChange={(e) => setNewRelation({ ...newRelation, icon: e.target.value })} placeholder="🔗" style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }} /></div>
              <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>连线颜色</label><input type="color" value={newRelation.color} onChange={(e) => setNewRelation({ ...newRelation, color: e.target.value })} style={{ width: '100%', height: 40, border: 'none', cursor: 'pointer' }} /></div>
              <div style={{ marginBottom: 20 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>描述（可选）</label><textarea value={newRelation.description} onChange={(e) => setNewRelation({ ...newRelation, description: e.target.value })} placeholder="这种关系的描述..." style={{ width: '100%', height: 60, padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, resize: 'vertical' }} /></div>
              <button onClick={handleAddCustomRelation} disabled={!newRelation.label.trim()} style={{ width: '100%', padding: 12, background: !newRelation.label.trim() ? COLORS.neutral[200] : COLORS.character.main, color: !newRelation.label.trim() ? COLORS.neutral[400] : '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: !newRelation.label.trim() ? 'not-allowed' : 'pointer' }}>✅ 添加关系类型</button>
            </div>
          )}
          
          {editingEdge && (
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: RADIUS.xl, boxShadow: SHADOWS.lg, padding: 24, zIndex: 2000, width: 400 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>✏️ 编辑关系</h3><button onClick={() => setEditingEdge(null)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div>
              <div style={{ padding: 16, background: COLORS.neutral[50], borderRadius: RADIUS.md, marginBottom: 20 }}><div style={{ fontSize: 14, color: COLORS.neutral[600], marginBottom: 8 }}>关系类型</div><div style={{ fontSize: 16, fontWeight: 700, color: editingEdge.data?.color || COLORS.neutral[700] }}>{editingEdge.data?.label || '默认关系'}</div></div>
              <div style={{ display: 'flex', gap: 12 }}><button onClick={() => handleDeleteEdge(editingEdge.id)} style={{ flex: 1, padding: 12, background: COLORS.force.light, color: COLORS.force.main, border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer' }}>🗑️ 删除关系</button><button onClick={() => setEditingEdge(null)} style={{ flex: 1, padding: 12, background: COLORS.neutral[200], color: COLORS.neutral[700], border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer' }}>关闭</button></div>
            </div>
          )}
          
          {viewMode === 'map' && (
            <div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32, overflow: 'auto' }}>
              <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.location.main, marginBottom: 8 }}>🗺️ 世界地图</h2>
                <p style={{ color: COLORS.neutral[400], marginBottom: 32 }}>AI 生成真实地形国境线</p>
                <div style={{ padding: 24, background: COLORS.neutral[50], borderRadius: RADIUS.xl, marginBottom: 32 }}><textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="描述你的世界设定..." style={{ width: '100%', height: 150, padding: 16, border: `2px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.lg, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, marginBottom: 16, boxSizing: 'border-box' }} /><button onClick={handleGenerateMap} disabled={aiLoading} style={{ padding: '14px 28px', background: aiLoading ? COLORS.neutral[200] : COLORS.location.gradient, color: aiLoading ? COLORS.neutral[400] : '#fff', border: 'none', borderRadius: RADIUS.lg, fontWeight: 700, fontSize: 16, cursor: aiLoading ? 'not-allowed' : 'pointer', boxShadow: SHADOWS.lg }}>{aiLoading ? '⏳ AI 生成中...' : '🗺️ AI 生成真实地形地图'}</button></div>
                <svg viewBox="0 0 1000 600" style={{ width: '100%', height: 'auto', background: 'url(#oceanPattern)', borderRadius: RADIUS.xl, boxShadow: SHADOWS.lg }}>
                  <defs><linearGradient id="oceanGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style={{ stopColor: '#5BA3D0', stopOpacity: 1 }} /><stop offset="100%" style={{ stopColor: '#3B7A9E', stopOpacity: 1 }} /></linearGradient><pattern id="oceanPattern" patternUnits="userSpaceOnUse" width="50" height="50"><rect width="50" height="50" fill="url(#oceanGradient)" /><path d="M 0,25 Q 12,20 25,25 T 50,25" stroke="#6BB6D8" strokeWidth="1" fill="none" opacity="0.3" /><path d="M 0,35 Q 12,30 25,35 T 50,35" stroke="#6BB6D8" strokeWidth="1" fill="none" opacity="0.2" /></pattern><filter id="terrainShadow"><feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.3" /></filter></defs>
                  <rect width="1000" height="600" fill="url(#oceanPattern)" />
                  {((window as any).__mapCountries || []).map((country: any, idx: number) => { const points = country.points || []; if (points.length < 3) return null; const pathData = `M ${points.map((p: number[]) => p.join(',')).join(' L ')} Z`; return (<g key={idx}><path d={pathData} fill={country.color || '#90EE90'} stroke="#228B22" strokeWidth="3" filter="url(#terrainShadow)" opacity="0.95" /><text x={points[0]?.[0] || 500} y={points[0]?.[1] || 300} textAnchor="middle" fontSize="16" fontWeight="700" fill="#228B22">{country.name}</text><text x={points[0]?.[0] || 500} y={(points[0]?.[1] || 300) + 22} textAnchor="middle" fontSize="12" fill="#228B22">🏰 {country.capital}</text></g>); })}
                  {((window as any).__mapCountries || []).length === 0 && (<><path d="M 400,280 L 450,270 L 520,275 L 580,290 L 600,320 L 590,360 L 550,385 L 480,390 L 420,375 L 390,340 L 395,300 Z" fill="#90EE90" stroke="#228B22" strokeWidth="3" filter="url(#terrainShadow)" /><text x="495" y="335" textAnchor="middle" fontSize="18" fontWeight="700" fill="#228B22">🏰 中州</text><text x="495" y="355" textAnchor="middle" fontSize="12" fill="#228B22">长安</text><path d="M 350,120 L 420,110 L 500,115 L 580,125 L 620,150 L 610,190 L 560,215 L 480,220 L 400,210 L 350,180 L 340,150 Z" fill="#E0FFFF" stroke="#228B22" strokeWidth="3" filter="url(#terrainShadow)" /><text x="475" y="175" textAnchor="middle" fontSize="16" fontWeight="700" fill="#228B22">❄️ 北境</text><path d="M 630,280 L 680,275 L 730,285 L 760,320 L 750,360 L 700,380 L 650,370 L 620,330 Z" fill="#98FB98" stroke="#2E8B2E" strokeWidth="3" filter="url(#terrainShadow)" /><text x="690" y="335" textAnchor="middle" fontSize="14" fontWeight="700" fill="#2E8B2E">🌅 东荒</text><path d="M 220,280 L 280,270 L 340,280 L 360,320 L 350,360 L 300,380 L 240,370 L 210,330 Z" fill="#F0E68C" stroke="#BDB76B" strokeWidth="3" filter="url(#terrainShadow)" /><text x="290" y="335" textAnchor="middle" fontSize="14" fontWeight="700" fill="#BDB76B">🌄 西域</text><path d="M 400,400 L 470,395 L 540,400 L 580,430 L 570,470 L 510,495 L 450,490 L 400,460 Z" fill="#2E8B57" stroke="#006400" strokeWidth="3" filter="url(#terrainShadow)" /><text x="485" y="450" textAnchor="middle" fontSize="16" fontWeight="700" fill="#006400">🔥 南疆</text><g transform="translate(920, 80)"><circle cx="0" cy="0" r="35" fill="#fff" stroke="#228B22" strokeWidth="2" /><polygon points="0,-25 5,-5 0,5 -5,-5" fill="#ef4444" /><text x="0" y="-30" textAnchor="middle" fontSize="10" fontWeight="700" fill="#228B22">N</text></g></>)}
                </svg>
              </div>
            </div>
          )}
          
          {viewMode === 'rules' && (
            <div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32, overflow: 'auto' }}>
              <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.organization.main, marginBottom: 8 }}>📜 世界规则</h2>
                <p style={{ color: COLORS.neutral[400], marginBottom: 32 }}>设定修炼体系、等级、地理、历史等规则</p>
                {worldRules.length === 0 ? (<div style={{ textAlign: 'center', padding: 64, background: COLORS.neutral[50], borderRadius: RADIUS.xl }}><div style={{ fontSize: 64, marginBottom: 16 }}>📜</div><div style={{ fontSize: 16, fontWeight: 600, color: COLORS.neutral[600] }}>暂无规则</div><div style={{ color: COLORS.neutral[400], marginTop: 8 }}>点击右下角 + 添加规则</div></div>) : (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>{worldRules.map(rule => (<div key={rule.id} style={{ padding: 24, background: COLORS.neutral[50], borderRadius: RADIUS.lg, border: `2px solid ${COLORS.organization.main}`, position: 'relative' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}><div onClick={() => setEditingRule(rule)} style={{ cursor: 'pointer', flex: 1 }}><div style={{ fontSize: 12, color: COLORS.organization.main, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{rule.category}</div><div style={{ fontSize: 18, fontWeight: 700, color: COLORS.neutral[800] }}>{rule.name}</div><div style={{ fontSize: 14, color: COLORS.neutral[600], lineHeight: 1.6, marginTop: 8 }}>{rule.description}</div></div><button onClick={() => setWorldRules(rules => rules.filter(r => r.id !== rule.id))} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: COLORS.neutral[400], padding: 4 }}>🗑️</button></div></div>))}</div>)}
                <button onClick={() => { setWorldRules(rules => [...rules, { id: Date.now().toString(), category: 'cultivation', name: '新规则', description: '' }]); }} style={{ position: 'fixed', bottom: 32, right: 32, width: 56, height: 56, borderRadius: RADIUS.full, background: COLORS.organization.gradient, color: '#fff', border: 'none', fontSize: 28, cursor: 'pointer', boxShadow: SHADOWS.lg }}>+</button>
              </div>
            </div>
          )}
          
          {editingRule && (
            <div style={{ position: 'fixed', right: 0, top: 64, bottom: 0, width: 400, background: '#fff', borderLeft: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 24, overflow: 'auto', zIndex: 1000 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}><h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📜 编辑规则</h3><button onClick={() => setEditingRule(null)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div>
              <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>分类</label><select value={editingRule.category} onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value as any })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="cultivation">修炼体系</option><option value="magic">魔法体系</option><option value="geography">地理</option><option value="history">历史</option></select></div>
              <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>规则名称</label><input value={editingRule.name} onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }} /></div>
              <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>规则描述</label><textarea value={editingRule.description} onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })} style={{ width: '100%', height: 200, padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, resize: 'vertical' }} /></div>
              <button onClick={() => { setWorldRules(rules => rules.map(r => r.id === editingRule.id ? editingRule : r)); setEditingRule(null); }} style={{ width: '100%', padding: 12, background: COLORS.organization.main, color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer' }}>💾 保存</button>
            </div>
          )}
          
          {viewMode === 'inspiration' && (<div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32 }}><h2>💡 AI 灵感生成</h2><textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="描述你的灵感..." style={{ width: '100%', height: 200, padding: 16, marginTop: 16 }} /><button onClick={handleAiGenerate} disabled={!aiPrompt.trim() || aiLoading} style={{ marginTop: 16, padding: '12px 24px', background: COLORS.character.main, color: '#fff', border: 'none', borderRadius: RADIUS.md, cursor: 'pointer' }}>{aiLoading ? '生成中...' : '生成'}</button></div>)}
          {viewMode === 'timeline' && (<div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32 }}><h2>📅 时间线</h2><p style={{ color: COLORS.neutral[400] }}>共 {events.length} 个事件</p></div>)}
          {viewMode === 'world' && (<div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32 }}><h2>🌍 世界观</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}><div style={{ padding: 32, background: COLORS.character.gradient, borderRadius: RADIUS.xl, color: '#fff' }}><div style={{ fontSize: 48, marginBottom: 16 }}>👥</div><div style={{ fontSize: 48, fontWeight: 800 }}>{characters.length}</div><div style={{ fontSize: 16, opacity: 0.9 }}>人物</div></div><div style={{ padding: 32, background: COLORS.organization.gradient, borderRadius: RADIUS.xl, color: '#fff' }}><div style={{ fontSize: 48, marginBottom: 16 }}>🏛️</div><div style={{ fontSize: 48, fontWeight: 800 }}>{organizations.length}</div><div style={{ fontSize: 16, opacity: 0.9 }}>组织</div></div><div style={{ padding: 32, background: COLORS.force.gradient, borderRadius: RADIUS.xl, color: '#fff' }}><div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div><div style={{ fontSize: 48, fontWeight: 800 }}>{forces.length}</div><div style={{ fontSize: 16, opacity: 0.9 }}>势力</div></div></div></div>)}
          {viewMode === 'outline' && (<div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32 }}><h2>📝 大纲导入</h2><textarea placeholder="粘贴大纲..." style={{ width: '100%', height: 400, padding: 16, marginTop: 16 }} /></div>)}
          {viewMode === 'panorama' && (<div style={{ flex: 1, margin: 16, marginLeft: sidebarOpen ? 0 : 16, background: '#fff', borderRadius: RADIUS.xl, border: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 32 }}><h2>🗺️ 全景</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 24 }}><div style={{ padding: 24, background: COLORS.neutral[50], borderRadius: RADIUS.xl }}><div style={{ fontSize: 14, color: COLORS.neutral[400] }}>人物</div><div style={{ fontSize: 48, fontWeight: 800, color: COLORS.character.main }}>{characters.length}</div></div><div style={{ padding: 24, background: COLORS.neutral[50], borderRadius: RADIUS.xl }}><div style={{ fontSize: 14, color: COLORS.neutral[400] }}>事件</div><div style={{ fontSize: 48, fontWeight: 800, color: COLORS.organization.main }}>{events.length}</div></div></div></div>)}
          
          {editingItem && (
            <div style={{ position: 'fixed', right: 0, top: 64, bottom: 0, width: 400, background: '#fff', borderLeft: `1px solid ${COLORS.neutral[200]}`, boxShadow: SHADOWS.lg, padding: 24, overflow: 'auto', zIndex: 1000 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{editingItem.type === 'character' && '👤 角色详情'}{editingItem.type === 'organization' && '🏛️ 组织详情'}{editingItem.type === 'force' && '⚔️ 势力详情'}{editingItem.type === 'location' && '📍 地点详情'}{editingItem.type === 'item' && '🎒 物品详情'}</h3>
                <button onClick={() => setEditingItem(null)} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>名称</label><input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }} /></div>
              <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>简介</label><textarea value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={{ width: '100%', height: 100, padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md, resize: 'vertical' }} /></div>
              {editingItem.type === 'character' && (<><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>年龄</label><input value={editForm.age || ''} onChange={(e) => setEditForm({ ...editForm, age: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }} /></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>性别</label><select value={editForm.gender || ''} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="">未知</option><option value="男">男</option><option value="女">女</option></select></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>所属组织</label><select value={editForm.organizationId || ''} onChange={(e) => setEditForm({ ...editForm, organizationId: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="">无</option>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>所属势力</label><select value={editForm.forceId || ''} onChange={(e) => setEditForm({ ...editForm, forceId: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="">无</option>{forces.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div></>)}
              {editingItem.type === 'item' && (<><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>类型</label><select value={editForm.type || 'weapon'} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="weapon">⚔️ 武器</option><option value="artifact">🔮 法宝</option><option value="material">🌿 材料</option><option value="skill">📖 功法</option></select></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>威力/等级</label><input value={editForm.power || ''} onChange={(e) => setEditForm({ ...editForm, power: e.target.value })} placeholder="如：地级上品" style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }} /></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>拥有者</label><select value={editForm.ownerId || ''} onChange={(e) => setEditForm({ ...editForm, ownerId: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="">无主</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></>)}
              {(editingItem.type === 'organization' || editingItem.type === 'force') && (<div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.neutral[600], marginBottom: 4 }}>领导者</label><select value={editForm.leaderId || ''} onChange={(e) => setEditForm({ ...editForm, leaderId: e.target.value })} style={{ width: '100%', padding: 10, border: `1px solid ${COLORS.neutral[200]}`, borderRadius: RADIUS.md }}><option value="">无</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>)}
              <button onClick={handleSaveEdit} style={{ width: '100%', padding: 12, background: COLORS.character.main, color: '#fff', border: 'none', borderRadius: RADIUS.md, fontWeight: 600, cursor: 'pointer' }}>💾 保存</button>
            </div>
          )}
        </main>
      </div>
    </ReactFlowProvider>
  );
}

export default App;
