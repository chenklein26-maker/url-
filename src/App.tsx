import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Link as LinkIcon, 
  Wand2, 
  Image as ImageIcon, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  LayoutGrid,
  List as ListIcon,
  Play,
  Folder,
  ChevronLeft,
  Search,
  X,
  Bot,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

// --- Robot Assistant Component ---
const RobotAssistant = ({ status, message }: { status: 'idle' | 'processing' | 'success' | 'error', message: string }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none"
    >
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.9 }}
            className="bg-white/90 backdrop-blur-md border border-emerald-100 px-4 py-2.5 rounded-2xl rounded-br-none shadow-xl shadow-emerald-500/10 max-w-[240px]"
          >
            <p className="text-[13px] font-medium text-neutral-800 leading-relaxed">
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="relative">
        <motion.div 
          animate={status === 'processing' ? {
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          } : {}}
          transition={{ repeat: Infinity, duration: 2 }}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-colors duration-500 ${
            status === 'processing' ? 'bg-emerald-500' : 
            status === 'error' ? 'bg-red-500' : 
            status === 'success' ? 'bg-emerald-600' : 'bg-black'
          }`}
        >
          <Bot size={28} className="text-white" />
          
          {/* Status Indicator */}
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
              status === 'processing' ? 'bg-yellow-400' : 
              status === 'error' ? 'bg-red-400' : 
              status === 'success' ? 'bg-emerald-400' : 'bg-neutral-400'
            }`}
          />
        </motion.div>
        
        {/* Decorative Ring */}
        <motion.div 
          animate={status === 'processing' ? { scale: [1, 1.5], opacity: [0.3, 0] } : { opacity: 0 }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="absolute inset-0 border-2 border-emerald-500 rounded-2xl pointer-events-none"
        />
      </div>
    </motion.div>
  );
};

interface ProcessedImage {
  original: string;
  processed: string;
  filename: string;
  success: boolean;
  localPath?: string;
  savedToNative?: boolean;
  error?: string;
}

interface ArticleData {
  title: string;
  content: string;
  html: string;
  images: string[];
}

interface Task {
  id: string;
  url: string;
  status: 'pending' | 'extracting' | 'polishing' | 'processing' | 'done' | 'error';
  error?: string;
  articleData?: ArticleData;
  polishedContent?: string;
  processedImages?: ProcessedImage[];
}

interface Prompt {
  id: string;
  name: string;
  content: string;
}

const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: 'game-editor',
    name: '游戏资讯编辑',
    content: `作为经验丰富的游戏网站编辑帮我润色我发给你的游戏资讯文章。
要求：
1. 输出必须是标准的 HTML 格式。
2. 结构要求（极其重要）：
   - 绝对不要使用 <h1>, <h2>, <h3> 等标题标签！大标题就正常用 <p> 和 <strong> 包裹即可。
   - 每个段落必须以 <p> 开头，紧接着一个换行符和一个制表符（Tab），然后是内容，最后以 </p> 结尾。
   - 大标题：写成长尾词 SEO 标题形式。格式示例：
     <p>
     	<strong>大标题内容</strong></p>
   - 小标题：使用【】框起来，字数10字左右。格式示例：
     <p>
     	【小标题内容】</p>
   - 普通段落：格式示例：
     <p>
     	段落内容</p>
3. 字符处理：
   - 使用 HTML 实体表示特殊符号：双引号用 &ldquo; 和 &rdquo;，破折号用 &mdash;。
4. 内容要求：
   - 大标题下需要一段简介。
   - 正文写成段落，不要分点。
   - 忽略任何导航菜单、面包屑、页脚等杂质。
   - 输出为简体中文。`
  },
  {
    id: 'tech-blog',
    name: '科技博文风格',
    content: '请将文章润色为专业、简洁的科技博文风格。输出为标准的 HTML 格式，不要使用 <h1> 等标题标签，每个段落使用 <p> 标签包裹，并在标签内使用换行和缩进。重要标题使用 <p><strong>标题内容</strong></p> 格式。'
  }
];

export default function App() {
  const [view, setView] = useState<'dashboard' | 'library' | 'settings'>('dashboard');
  const [urlInput, setUrlInput] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>(() => {
    const saved = localStorage.getItem('article_flow_prompts_v2');
    return saved ? JSON.parse(saved) : DEFAULT_PROMPTS;
  });
  const [activePromptId, setActivePromptId] = useState(() => {
    return localStorage.getItem('article_flow_active_prompt_id_v2') || DEFAULT_PROMPTS[0].id;
  });
  
  const [imageSavePath, setImageSavePath] = useState(() => {
    return localStorage.getItem('article_flow_image_save_path') || '';
  });
  
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [nativeFolderHandle, setNativeFolderHandle] = useState<any>(null);

  const activePrompt = useMemo(() => 
    prompts.find(p => p.id === activePromptId) || prompts[0], 
    [prompts, activePromptId]
  );

  useEffect(() => {
    localStorage.setItem('article_flow_prompts_v2', JSON.stringify(prompts));
  }, [prompts]);

  useEffect(() => {
    localStorage.setItem('article_flow_active_prompt_id_v2', activePromptId);
  }, [activePromptId]);

  useEffect(() => {
    localStorage.setItem('article_flow_image_save_path', imageSavePath);
  }, [imageSavePath]);

  useEffect(() => {
    // Fetch initial proxy config
    fetch('/api/config/proxy')
      .then(res => res.json())
      .then(data => {
        if (data.proxyUrl) setProxyUrl(data.proxyUrl);
      })
      .catch(err => console.error('Failed to fetch proxy config', err));
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [robotStatus, setRobotStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [robotMessage, setRobotMessage] = useState('你好！我是您的内容同步助手。');

  const updateRobot = (status: 'idle' | 'processing' | 'success' | 'error', message: string, duration = 4000) => {
    setRobotStatus(status);
    setRobotMessage(message);
    if (status !== 'processing' && duration > 0) {
      setTimeout(() => {
        setRobotStatus('idle');
        setRobotMessage('准备就绪，随时可以开始。');
      }, duration);
    }
  };

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  const isCancelledRef = useRef(false);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId]);

  const handleAddUrls = () => {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));
    const newTasks: Task[] = urls.map(url => ({
      id: Math.random().toString(36).substring(7),
      url,
      status: 'pending'
    }));
    setTasks(prev => [...prev, ...newTasks]);
    setUrlInput('');
    updateRobot('success', `成功添加 ${newTasks.length} 个任务！`);
    if (!selectedTaskId && newTasks.length > 0) {
      setSelectedTaskId(newTasks[0].id);
    }
  };

  const callGeminiWithRetry = async (params: any, maxRetries = 3): Promise<any> => {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await ai.models.generateContent(params);
      } catch (err: any) {
        lastError = err;
        const errorStr = err.message || '';
        if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
          let waitTime = Math.pow(2, i) * 2000;
          const match = errorStr.match(/retry in ([\d.]+)s/);
          if (match) {
            waitTime = parseFloat(match[1]) * 1000 + 1000;
          }
          console.log(`Quota exceeded, retrying in ${waitTime}ms... (Attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  };

  const processTask = async (taskId: string) => {
    try {
      if (isCancelledRef.current) return;
      
      // 1. Extract Article
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'extracting', error: undefined } : t));
      updateRobot('processing', '正在提取文章内容...');
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (isCancelledRef.current) throw new Error('任务已取消');

      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: task.url })
      });
      
      if (!extractRes.ok) throw new Error('无法提取文章内容，请检查URL是否正确。');
      const data: ArticleData = await extractRes.json();
      
      if (isCancelledRef.current) throw new Error('任务已取消');
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, articleData: data, status: 'polishing' } : t));
      updateRobot('processing', '正在使用 AI 润色文章...');

      // 2. Polish Content
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        contents: `你是一位经验丰富的编辑。请严格按照以下要求润色文章，并输出为标准的 HTML 格式（仅包含 <p>, <strong>, <a> 等标签，不要包含 <html> 或 <body>）：
要求：${activePrompt.content}

待处理内容：
标题：${data.title}
正文：${data.content}

请直接输出润色后的 HTML 全文。注意：
1. 忽略任何导航菜单、面包屑、页脚或其他非正文内容。
2. 不要包含任何多余的解释、Markdown 代码块标记（如 \`\`\`html）或注释。
3. 严格遵循 HTML 结构要求（<p>\n\t...）。`,
      });
      
      if (isCancelledRef.current) throw new Error('任务已取消');
      
      let polished = response.text || '';
      // Clean up Markdown code blocks if present
      polished = polished.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, polishedContent: polished, status: 'processing' } : t));
      updateRobot('processing', '正在处理并转换图片...');

      // 3. Process Images
      if (isCancelledRef.current) throw new Error('任务已取消');

      const imageRes = await fetch('/api/process-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images: data.images, 
          taskId: taskId,
          imageSavePath: imageSavePath
        })
      });
      
      if (!imageRes.ok) throw new Error('图片处理失败。');
      const imageData = await imageRes.json();
      const results = imageData.results || [];
      
      if (isCancelledRef.current) throw new Error('任务已取消');

      // If native folder is selected, save images to it
      if (nativeFolderHandle && results.length > 0) {
        for (const img of results) {
          if (isCancelledRef.current) throw new Error('任务已取消');
          if (img.success && img.processed) {
            try {
              const res = await fetch(img.processed);
              const blob = await res.blob();
              const fileHandle = await nativeFolderHandle.getFileHandle(img.filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              img.savedToNative = true;
            } catch (err) {
              console.error(`Failed to save ${img.filename} to native folder:`, err);
            }
          }
        }
      }

      if (isCancelledRef.current) throw new Error('任务已取消');
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, processedImages: results, status: 'done' } : t));

    } catch (err: any) {
      if (err.message === '任务已取消') {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'pending', error: undefined } : t));
        return;
      }
      let errorMessage = err.message || '未知错误';
      if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'API 调用额度已耗尽或请求过于频繁。系统已尝试自动重试，但仍未成功。请稍等片刻后再试。';
      }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error', error: errorMessage } : t));
      updateRobot('error', `处理出错: ${errorMessage.substring(0, 30)}...`);
    }
  };

  const handleStartAll = async () => {
    isCancelledRef.current = false;
    setIsProcessing(true);
    updateRobot('processing', '开始批量处理任务，请稍候...');
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'error');
    await Promise.all(pendingTasks.map(task => processTask(task.id)));
    setIsProcessing(false);
    if (!isCancelledRef.current) {
      updateRobot('success', '所有任务处理完成！');
    }
  };

  const handleCancelAll = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
    updateRobot('error', '处理已取消。');
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);
  };

  const clearAll = () => {
    setTasks([]);
    setSelectedTaskId(null);
  };

  const handleSavePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrompt) return;

    if (editingPrompt.id === 'new') {
      const newPrompt = { ...editingPrompt, id: Math.random().toString(36).substring(7) };
      setPrompts([...prompts, newPrompt]);
    } else {
      setPrompts(prompts.map(p => p.id === editingPrompt.id ? editingPrompt : p));
    }
    setEditingPrompt(null);
  };

  const deletePrompt = (id: string) => {
    if (prompts.length <= 1) return;
    setPrompts(prompts.filter(p => p.id !== id));
    if (activePromptId === id) setActivePromptId(prompts.find(p => p.id !== id)!.id);
  };

  const handleSaveProxy = async (urlOverride?: string) => {
    const urlToSave = urlOverride !== undefined ? urlOverride : proxyUrl;
    try {
      await fetch('/api/config/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToSave })
      });
      if (urlOverride === undefined) alert('代理设置已保存');
    } catch (err) {
      if (urlOverride === undefined) alert('保存失败');
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-connection');
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans overflow-hidden relative">
      <RobotAssistant status={robotStatus} message={robotMessage} />
      
      {/* Sidebar - Navigation & Task List */}
      <motion.aside 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 border-r border-black/5 bg-white flex flex-col shrink-0"
      >
        <div className="p-6 border-b border-black/5">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <RefreshCw size={18} />
            </div>
            <h1 className="font-bold text-lg tracking-tight">ArticleFlow Pro</h1>
          </div>

          <nav className="flex gap-1 p-1 bg-neutral-100 rounded-xl mb-6">
            <button 
              onClick={() => setView('dashboard')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                view === 'dashboard' ? 'bg-white text-emerald-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <LayoutGrid size={14} /> 任务看板
            </button>
            <button 
              onClick={() => setView('library')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                view === 'library' ? 'bg-white text-emerald-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Wand2 size={14} /> 提示词库
            </button>
            <button 
              onClick={() => setView('settings')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                view === 'settings' ? 'bg-white text-emerald-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Search size={14} /> 网络设置
            </button>
          </nav>
          
          {view === 'dashboard' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <textarea 
                placeholder="输入 URL (每行一个)"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-neutral-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all resize-none h-24"
              />
              <button 
                onClick={handleAddUrls}
                className="w-full bg-black text-white py-2 rounded-xl text-sm font-semibold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} /> 添加链接
              </button>
            </motion.div>
          )}
        </div>

        {view === 'dashboard' ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">操作面板</span>
                {tasks.length > 0 && (
                  <button onClick={clearAll} className="text-[10px] font-bold text-red-400 uppercase hover:text-red-600 transition-colors">清空全部</button>
                )}
              </div>
              
              <div className="p-6 bg-neutral-50 rounded-2xl border border-black/5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                      <Folder size={10} /> 本地保存路径 (原生弹窗)
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 text-xs rounded-xl border border-neutral-200 bg-white truncate">
                      {nativeFolderHandle ? (
                        <span className="text-emerald-600 font-bold">已选择: {nativeFolderHandle.name}</span>
                      ) : (
                        <span className="text-neutral-400">未选择文件夹</span>
                      )}
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const handle = await (window as any).showDirectoryPicker();
                          setNativeFolderHandle(handle);
                        } catch (err) {
                          console.error('Picker cancelled or failed', err);
                        }
                      }}
                      className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all flex items-center gap-1"
                    >
                      <Folder size={14} /> 选择
                    </button>
                  </div>
                  <p className="text-[9px] text-neutral-400 px-1">处理完成后图片将自动保存至该文件夹</p>
                </div>

                <textarea 
                  placeholder="输入 URL (每行一个)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-neutral-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all resize-none h-24 bg-white"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={handleAddUrls}
                    disabled={isProcessing}
                    className="flex-1 bg-black text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> 添加链接
                  </button>
                  {isProcessing ? (
                    <button 
                      onClick={handleCancelAll}
                      className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                    >
                      <X size={16} /> 取消处理
                    </button>
                  ) : (
                    <button 
                      onClick={handleStartAll}
                      disabled={tasks.filter(t => t.status === 'pending' || t.status === 'error').length === 0}
                      className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <Play size={16} /> 一键同步处理
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : view === 'library' ? (
          <div className="flex-1 p-6 space-y-4">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">我的提示词</span>
              <button 
                onClick={() => setEditingPrompt({ id: 'new', name: '', content: '' })}
                className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {prompts.map(p => (
                <div
                  key={p.id}
                  onClick={() => setActivePromptId(p.id)}
                  className={`w-full p-3 rounded-xl text-left border transition-all group relative cursor-pointer ${
                    activePromptId === p.id 
                      ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
                      : 'bg-white border-black/5 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${activePromptId === p.id ? 'text-emerald-900' : 'text-neutral-700'}`}>
                      {p.name}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingPrompt(p); }}
                        className="p-1 hover:bg-emerald-100 text-emerald-600 rounded-md"
                      >
                        <FileText size={12} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deletePrompt(p.id); }}
                        className="p-1 hover:bg-red-100 text-red-600 rounded-md"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1 line-clamp-2">{p.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 space-y-6">
            <div className="space-y-4">
              <div className="px-2">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">代理配置</span>
              </div>
              <div className="p-4 bg-neutral-50 rounded-2xl border border-black/5 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-600">HTTP/HTTPS 代理地址</label>
                  <input 
                    type="text"
                    placeholder="例如: http://127.0.0.1:7890"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-neutral-200 focus:border-emerald-500 outline-none transition-all bg-white"
                  />
                  <p className="text-[10px] text-neutral-400">配置后，程序后台抓取文章和图片将通过此代理。如果您的 VPN 无法被程序识别，请在此手动输入代理地址。</p>
                </div>
                <button 
                  onClick={() => handleSaveProxy()}
                  className="w-full bg-black text-white py-2 rounded-xl text-sm font-semibold hover:bg-neutral-800 transition-all"
                >
                  保存代理设置
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="px-2">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">网络连通性测试</span>
              </div>
              <div className="p-4 bg-neutral-50 rounded-2xl border border-black/5 space-y-4">
                <button 
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="w-full border border-emerald-500 text-emerald-600 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                >
                  {isTesting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  测试当前网络环境 (VPN)
                </button>

                {testResult && (
                  <div className={`p-4 rounded-xl border ${testResult.success ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                    {testResult.success ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                          <CheckCircle2 size={16} /> 连接成功
                        </div>
                        <div className="grid grid-cols-2 gap-y-2 text-[11px]">
                          <span className="text-neutral-500">出口 IP:</span>
                          <span className="font-mono font-bold text-neutral-700">{testResult.ip}</span>
                          <span className="text-neutral-500">地理位置:</span>
                          <span className="font-bold text-neutral-700">{testResult.location}</span>
                          <span className="text-neutral-500">运营商:</span>
                          <span className="font-bold text-neutral-700">{testResult.isp}</span>
                          <span className="text-neutral-500">延迟:</span>
                          <span className="font-bold text-neutral-700">{testResult.latency}</span>
                          <span className="text-neutral-500">代理状态:</span>
                          <span className={`font-bold ${testResult.proxyActive ? 'text-emerald-600' : 'text-neutral-400'}`}>
                            {testResult.proxyActive ? '已启用' : '未启用'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                          <AlertCircle size={16} /> 连接失败
                        </div>
                        <p className="text-[11px] text-red-500">{testResult.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'dashboard' ? (
          <>
            {/* Top Bar - Active Prompt Info */}
            <header className="h-16 border-b border-black/5 bg-white flex items-center px-8 justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  当前提示词
                </div>
                <span className="text-sm font-bold text-neutral-700">{activePrompt.name}</span>
              </div>
              <button 
                onClick={() => setView('library')}
                className="text-xs font-bold text-neutral-400 hover:text-emerald-500 transition-colors flex items-center gap-1"
              >
                切换提示词 <ChevronRight size={14} />
              </button>
            </header>
            
            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 bg-neutral-50/50">
              <AnimatePresence mode="wait">
                {selectedTask ? (
                  <motion.div 
                    key={selectedTask.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="max-w-6xl mx-auto space-y-8"
                  >
                    {/* Task Header */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <button 
                          onClick={() => setSelectedTaskId(null)}
                          className="text-xs font-bold text-neutral-400 hover:text-emerald-500 flex items-center gap-1 mb-4 transition-colors"
                        >
                          <ChevronRight size={14} className="rotate-180" /> 返回任务列表
                        </button>
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-widest">
                          {selectedTask.status === 'done' && <CheckCircle2 size={14} />}
                          {selectedTask.status}
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight">{selectedTask.articleData?.title || '正在提取内容...'}</h2>
                        <a href={selectedTask.url} target="_blank" rel="noreferrer" className="text-sm text-neutral-400 hover:text-emerald-500 flex items-center gap-1 transition-colors">
                          {selectedTask.url} <ExternalLink size={12} />
                        </a>
                      </div>
                      
                      {selectedTask.status === 'done' && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => navigator.clipboard.writeText(selectedTask.polishedContent || '')}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-black/5 rounded-xl text-sm font-semibold hover:bg-neutral-50 transition-all shadow-sm"
                          >
                            <Copy size={16} /> 复制 HTML
                          </button>
                        </div>
                      )}
                    </div>

                    {selectedTask.status === 'error' && (
                      <div className="p-6 bg-red-50 border border-red-100 rounded-3xl flex items-start gap-4 text-red-600">
                        <AlertCircle size={24} className="shrink-0" />
                        <div className="space-y-1">
                          <p className="font-bold">处理出错</p>
                          <p className="text-sm">{selectedTask.error}</p>
                        </div>
                      </div>
                    )}

                    {selectedTask.status !== 'pending' && selectedTask.status !== 'error' && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                          <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-black/5 min-h-[600px]">
                            {selectedTask.status === 'polishing' || selectedTask.status === 'extracting' ? (
                              <div className="flex flex-col items-center justify-center h-full py-24 text-neutral-400 space-y-4">
                                <Loader2 size={48} className="animate-spin text-emerald-500" />
                                <p className="text-sm font-medium">AI 正在努力润色中...</p>
                              </div>
                            ) : (
                              <div className="prose prose-neutral max-w-none">
                                <div dangerouslySetInnerHTML={{ __html: selectedTask.polishedContent || '' }} />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 sticky top-8">
                            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                              <ImageIcon size={18} className="text-emerald-500" /> 正文图片 ({selectedTask.processedImages?.length || 0})
                            </h3>
                            
                            <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
                              {selectedTask.processedImages?.map((img, i) => (
                                <div key={i} className="group relative rounded-2xl overflow-hidden border border-black/5 bg-neutral-50">
                                  {img.success ? (
                                    <>
                                      <img 
                                        src={img.processed} 
                                        alt={`Processed ${i}`} 
                                        className="w-full aspect-video object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                        <a 
                                          href={img.processed} 
                                          download 
                                          className="p-2 bg-white rounded-full text-black hover:scale-110 transition-transform"
                                        >
                                          <Download size={18} />
                                        </a>
                                      </div>
                                      <div className="p-3 bg-white border-t border-black/5 flex items-center justify-between">
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-mono text-neutral-400 truncate max-w-[120px]">
                                            {img.filename}
                                          </span>
                                          {img.savedToNative && (
                                            <span className="text-[9px] text-emerald-500 font-bold flex items-center gap-0.5">
                                              <CheckCircle2 size={8} /> 已自动存入本地
                                            </span>
                                          )}
                                          {img.localPath && (
                                            <span className="text-[9px] text-blue-500 font-bold flex items-center gap-0.5" title={img.localPath}>
                                              <CheckCircle2 size={8} /> 已存至伺服器路徑
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">JPG</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="p-4 flex items-center gap-3 text-red-500 bg-red-50 text-xs">
                                      <AlertCircle size={14} /> 处理失败
                                    </div>
                                  )}
                                </div>
                              ))}

                              {selectedTask.status === 'processing' && (
                                <div className="py-12 text-center text-neutral-400 space-y-4">
                                  <Loader2 size={32} className="animate-spin mx-auto text-emerald-500" />
                                  <p className="text-xs">正在转换图片...</p>
                                </div>
                              )}

                              {selectedTask.status === 'done' && (!selectedTask.processedImages || selectedTask.processedImages.length === 0) && (
                                <div className="py-12 text-center text-neutral-400 space-y-2">
                                  <ImageIcon size={32} className="mx-auto opacity-20" />
                                  <p className="text-xs">未发现正文图片</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="max-w-6xl mx-auto space-y-8">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold tracking-tight">任务列表 ({tasks.length})</h2>
                    </div>
                    
                    {tasks.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {tasks.map(task => (
                    <motion.div
                      layout
                      key={task.id}
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                      className={`p-6 rounded-[2rem] border transition-all flex flex-col justify-between group relative ${
                        task.status === 'done' ? 'bg-white border-emerald-100 shadow-sm' :
                        task.status === 'error' ? 'bg-red-50/30 border-red-100' :
                        'bg-white border-black/5'
                      }`}
                    >
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  task.status === 'done' ? 'bg-emerald-100 text-emerald-600' :
                                  task.status === 'error' ? 'bg-red-100 text-red-600' :
                                  task.status === 'pending' ? 'bg-neutral-100 text-neutral-500' :
                                  'bg-blue-100 text-blue-600'
                                }`}>
                                  {task.status === 'done' ? '已完成' : 
                                   task.status === 'error' ? '处理失败' : 
                                   task.status === 'pending' ? '待处理' : '处理中...'}
                                </div>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}
                                  className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              
                              <div className="space-y-1">
                                <h3 className="font-bold text-neutral-800 line-clamp-2 min-h-[3rem]">
                                  {task.articleData?.title || task.url}
                                </h3>
                                <p className="text-[10px] text-neutral-400 truncate">{task.url}</p>
                              </div>

                              {(task.status === 'extracting' || task.status === 'polishing' || task.status === 'processing') && (
                                <div className="space-y-2">
                                  <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                                    <motion.div 
                                      className="h-full bg-emerald-500"
                                      initial={{ width: "0%" }}
                                      animate={{ width: task.status === 'extracting' ? '30%' : task.status === 'polishing' ? '60%' : '90%' }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-neutral-400 font-medium text-center">
                                    {task.status === 'extracting' ? '正在提取文章...' : 
                                     task.status === 'polishing' ? 'AI 正在润色...' : '正在处理图片...'}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="mt-6 flex gap-2">
                              <button 
                                onClick={() => setSelectedTaskId(task.id)}
                                className="flex-1 py-2.5 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-bold hover:bg-neutral-200 transition-all"
                              >
                                查看详情
                              </button>
                              {task.status === 'done' && (
                                <button 
                                  onClick={() => navigator.clipboard.writeText(task.polishedContent || '')}
                                  className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all"
                                  title="复制 HTML"
                                >
                                  <Copy size={16} />
                                </button>
                              )}
                            </div>
                          </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="h-[400px] flex flex-col items-center justify-center text-neutral-400 space-y-6 bg-white rounded-[3rem] border border-dashed border-neutral-200">
                        <div className="w-20 h-20 bg-neutral-50 rounded-3xl flex items-center justify-center">
                          <LayoutGrid size={32} className="opacity-20" />
                        </div>
                        <div className="text-center space-y-2">
                          <h3 className="text-lg font-bold text-black">暂无任务</h3>
                          <p className="text-sm max-w-xs">在左侧输入文章链接并点击“添加链接”开始您的创作流程。</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : view === 'library' ? (
          <div className="flex-1 overflow-y-auto p-12">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="space-y-2">
                <h2 className="text-4xl font-bold tracking-tight">提示词库</h2>
                <p className="text-neutral-500 text-lg">管理您的 AI 润色规则，为不同类型的文章定制专属风格。</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnimatePresence mode="popLayout">
                  {prompts.map(p => (
                    <motion.div 
                      layout
                      key={p.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                      className={`p-8 rounded-[2rem] border transition-all flex flex-col justify-between group ${
                        activePromptId === p.id 
                          ? 'bg-emerald-50 border-emerald-200 shadow-lg shadow-emerald-500/10' 
                          : 'bg-white border-black/5 hover:border-neutral-300'
                      }`}
                    >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-xl">{p.name}</h3>
                        {activePromptId === p.id && (
                          <div className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[10px] font-bold uppercase tracking-wider">
                            使用中
                          </div>
                        )}
                      </div>
                      <p className="text-neutral-500 text-sm leading-relaxed line-clamp-4">{p.content}</p>
                    </div>
                    
                    <div className="mt-8 flex items-center justify-between">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditingPrompt(p)}
                          className="px-4 py-2 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-bold hover:bg-neutral-200 transition-all"
                        >
                          编辑
                        </button>
                        <button 
                          onClick={() => deletePrompt(p.id)}
                          className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-all"
                        >
                          删除
                        </button>
                      </div>
                      {activePromptId !== p.id && (
                        <button 
                          onClick={() => setActivePromptId(p.id)}
                          className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all"
                        >
                          设为当前
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                
                <motion.button 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setEditingPrompt({ id: 'new', name: '', content: '' })}
                  className="p-8 rounded-[2rem] border-2 border-dashed border-neutral-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex flex-col items-center justify-center text-neutral-400 hover:text-emerald-600 space-y-4 group"
                >
                  <div className="w-12 h-12 rounded-full bg-neutral-100 group-hover:bg-emerald-100 flex items-center justify-center transition-all">
                    <Plus size={24} />
                  </div>
                  <span className="font-bold">添加新提示词</span>
                </motion.button>
              </AnimatePresence>
            </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-12">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="space-y-2">
                <h2 className="text-4xl font-bold tracking-tight">网络设置</h2>
                <p className="text-neutral-500 text-lg">配置代理服务器以解决网络连接问题，并测试 VPN 是否生效。</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-[2.5rem] border border-black/5 shadow-sm space-y-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                        <Search size={20} />
                      </div>
                      <h3 className="font-bold text-xl">代理配置</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-neutral-600">HTTP/HTTPS 代理地址</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="例如: http://127.0.0.1:7890"
                          value={proxyUrl}
                          onChange={(e) => setProxyUrl(e.target.value)}
                          className="flex-1 px-4 py-3 rounded-2xl border border-neutral-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                        />
                        {proxyUrl && (
                          <button 
                            type="button"
                            onClick={() => {
                              setProxyUrl('');
                              handleSaveProxy('');
                            }}
                            className="px-4 py-3 bg-neutral-100 text-neutral-500 rounded-2xl hover:bg-neutral-200 transition-all"
                            title="清除代理"
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                      </div>
                      <button 
                        onClick={() => handleSaveProxy()}
                        className="w-full bg-black text-white py-3.5 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-black/10"
                      >
                        应用代理设置
                      </button>
                    </div>
                    
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-black/5">
                      <p className="text-xs text-neutral-500 leading-relaxed">
                        <span className="font-bold text-neutral-700">提示：</span>
                        如果您的 VPN 无法被程序自动识别，请在此手动输入代理地址。
                        通常 Clash 的默认代理地址为 <code className="bg-neutral-200 px-1 rounded">http://127.0.0.1:7890</code>。
                      </p>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-white p-8 rounded-[2.5rem] border border-black/5 shadow-sm space-y-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <RefreshCw size={20} />
                      </div>
                      <h3 className="font-bold text-xl">连通性测试</h3>
                    </div>

                    <button 
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="w-full border-2 border-emerald-500 text-emerald-600 py-3.5 rounded-2xl font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
                    >
                      {isTesting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                      立即测试 VPN 状态
                    </button>

                    {testResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-6 rounded-3xl border ${testResult.success ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50 border-red-100'}`}
                      >
                        {testResult.success ? (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-emerald-600 font-bold">
                              <CheckCircle2 size={20} /> 网络连接正常
                            </div>
                            <div className="space-y-3">
                              <div className="flex justify-between items-center border-b border-emerald-100 pb-2">
                                <span className="text-xs text-neutral-500">出口 IP</span>
                                <span className="text-sm font-mono font-bold text-neutral-700">{testResult.ip}</span>
                              </div>
                              <div className="flex justify-between items-center border-b border-emerald-100 pb-2">
                                <span className="text-xs text-neutral-500">地理位置</span>
                                <span className="text-sm font-bold text-neutral-700">{testResult.location}</span>
                              </div>
                              <div className="flex justify-between items-center border-b border-emerald-100 pb-2">
                                <span className="text-xs text-neutral-500">运营商</span>
                                <span className="text-sm font-bold text-neutral-700">{testResult.isp}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-neutral-500">延迟</span>
                                <span className="text-sm font-bold text-neutral-700">{testResult.latency}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-red-600 font-bold">
                              <AlertCircle size={20} /> 连接失败
                            </div>
                            <p className="text-xs text-red-500 leading-relaxed">{testResult.error}</p>
                            <p className="text-[10px] text-neutral-400">请检查您的代理地址是否正确，或者 VPN 是否已开启。</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Edit Prompt Modal */}
      <AnimatePresence>
        {editingPrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPrompt(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSavePrompt} className="p-10 space-y-8">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{editingPrompt.id === 'new' ? '添加提示词' : '编辑提示词'}</h3>
                  <p className="text-neutral-500 text-sm">定义您的润色规则，让 AI 按照您的风格进行创作。</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">名称</label>
                    <input 
                      required
                      type="text"
                      value={editingPrompt.name}
                      onChange={(e) => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:border-emerald-500 outline-none transition-all"
                      placeholder="例如：专业游戏编辑"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">指令内容</label>
                    <textarea 
                      required
                      rows={8}
                      value={editingPrompt.content}
                      onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:border-emerald-500 outline-none transition-all resize-none"
                      placeholder="输入详细的润色指令..."
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setEditingPrompt(null)}
                    className="flex-1 py-4 bg-neutral-100 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-200 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    保存
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
}
