import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  User,
  Zap,
  BarChart2,
  DollarSign,
  Brain,
  ClipboardList,
  RefreshCw,
  Pause,
  Play,
  Sun,
  Moon,
  AlertTriangle,
  Inbox,
  FileText,
  Wrench,
  Clock,
  MessageSquare,
  Activity,
  Filter,
  Eye,
  EyeOff
} from 'lucide-react';

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost?: {
    total: number;
  };
}

interface Session {
  id: string;
  filename: string;
  label: string;
  startTime: string;
  messageCount: number;
  lastActivity: string;
  isSubagent: boolean;
  status: 'active' | 'completed' | 'unknown';
  model: string;
  totalTokens: number;
  totalCost: number;
}

interface TranscriptMessage {
  role: string;
  content: string;
  timestamp: string | null;
  toolCalls?: ToolCall[];
  toolResult?: {
    toolName: string;
    isError: boolean;
  };
  usage?: Usage;
  model?: string;
  isThinking?: boolean;
}

interface SessionDetail {
  id: string;
  label: string;
  model: string;
  totalTokens: number;
  totalCost: number;
  transcript: TranscriptMessage[];
  totalMessages: number;
  isSubagent?: boolean;
}

const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : `http://${window.location.hostname}:3001/api`;

function timeSince(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: 'bg-emerald-500',
    completed: 'bg-neutral-500',
    unknown: 'bg-amber-500'
  };
  
  return (
    <span className={`inline-flex items-center justify-center w-2.5 h-2.5 rounded-full ${colors[status as keyof typeof colors] || colors.unknown} ${status === 'active' ? 'animate-pulse' : ''}`} />
  );
}

function LoadingSkeleton({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className={`p-5 rounded-2xl border animate-pulse ${
            darkMode 
              ? 'bg-neutral-800/50 border-neutral-700/50' 
              : 'bg-white border-neutral-200'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
            <div className={`h-5 w-32 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
          </div>
          <div className={`h-3 w-24 rounded mb-4 ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="flex justify-between">
                <div className={`h-3 w-16 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
                <div className={`h-3 w-12 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function SessionCard({ session, onClick, isSelected, darkMode }: { 
  session: Session; 
  onClick: () => void;
  isSelected: boolean;
  darkMode: boolean;
}) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`p-5 rounded-2xl cursor-pointer transition-colors duration-200 border ${
        isSelected 
          ? darkMode 
            ? 'border-blue-500 bg-blue-950/40' 
            : 'border-blue-500 bg-blue-50'
          : darkMode
            ? 'border-neutral-700/50 bg-neutral-800/50 hover:border-neutral-600'
            : 'border-neutral-200 bg-white hover:border-neutral-300'
      } ${session.isSubagent ? darkMode ? 'ring-1 ring-purple-500/40' : 'ring-1 ring-purple-400/60' : ''}`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusBadge status={session.status} />
          <h3 className={`font-semibold truncate tracking-tight ${darkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>
            {session.label || session.id.slice(0, 8)}
          </h3>
        </div>
        {session.isSubagent && (
          <span className={`ml-2 px-2 py-1 text-xs rounded-full font-medium flex items-center gap-1 ${
            darkMode ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50' : 'bg-purple-100 text-purple-700'
          }`}>
            <Bot className="w-3 h-3" />
            sub-agent
          </span>
        )}
      </div>
      
      <div className={`text-xs mb-3 flex items-center gap-1.5 ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        <Brain className="w-3 h-3" />
        {session.model}
      </div>
      
      <div className={`text-sm space-y-2 ${darkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Messages
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{session.messageCount}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" />
            Tokens
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{formatTokens(session.totalTokens)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            Cost
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{formatCost(session.totalCost)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Last activity
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{timeSince(session.lastActivity)}</span>
        </div>
      </div>
      
      <div className={`mt-3 pt-3 text-xs truncate font-mono border-t ${
        darkMode ? 'text-neutral-600 border-neutral-700/50' : 'text-neutral-400 border-neutral-200'
      }`}>
        {session.id.slice(0, 20)}...
      </div>
    </motion.div>
  );
}

function ToolCallBlock({ toolCall, darkMode }: { toolCall: ToolCall; darkMode: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const isLong = argsStr.length > 100;
  
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className={`mt-3 rounded-xl p-4 font-mono text-xs border ${
        darkMode ? 'bg-amber-950/30 border-amber-800/50' : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
          darkMode ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-200 text-amber-800'
        }`}>
          <Wrench className="w-3 h-3" />
          {toolCall.name}
        </span>
        {isLong && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className={`text-xs hover:underline ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}
          >
            {expanded ? 'collapse' : 'expand'}
          </button>
        )}
      </div>
      <pre className={`whitespace-pre-wrap break-all ${darkMode ? 'text-amber-200' : 'text-amber-900'}`}>
        {expanded || !isLong ? argsStr : argsStr.slice(0, 100) + '...'}
      </pre>
    </motion.div>
  );
}

function MessageBubble({ msg, darkMode, index }: { msg: TranscriptMessage; darkMode: boolean; index: number }) {
  const isUser = msg.role === 'user';
  const isTool = msg.role === 'tool';
  const isAssistant = msg.role === 'assistant';
  
  let bgClass = '';
  let textClass = darkMode ? 'text-neutral-100' : 'text-neutral-900';
  
  if (isUser) {
    bgClass = darkMode ? 'bg-blue-950/40 border-blue-800/30' : 'bg-blue-50 border-blue-200';
  } else if (isTool) {
    bgClass = darkMode ? 'bg-neutral-800/60 border-neutral-700/50' : 'bg-neutral-100 border-neutral-200';
    textClass = darkMode ? 'text-neutral-300' : 'text-neutral-700';
  } else {
    bgClass = darkMode ? 'bg-neutral-800/40 border-neutral-700/50' : 'bg-white border-neutral-200';
  }
  
  const RoleIcon = isUser ? User : isTool ? Zap : Bot;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`p-5 rounded-2xl border ${bgClass} ${isUser ? 'ml-12' : isTool ? 'mx-6' : 'mr-12'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
          darkMode ? 'text-neutral-400' : 'text-neutral-500'
        }`}>
          <RoleIcon className="w-3.5 h-3.5" />
          {isUser ? 'User' : isTool ? (msg.toolResult?.toolName || 'Tool') : 'Assistant'}
          {msg.isThinking && <span className="normal-case font-normal">(thinking)</span>}
        </span>
        {msg.timestamp && (
          <span className={`text-xs flex items-center gap-1 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
            <Clock className="w-3 h-3" />
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      
      <div className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${textClass}`}>
        {msg.content.slice(0, 3000)}
        {msg.content.length > 3000 && (
          <span className={`italic ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
            ... (truncated, {msg.content.length.toLocaleString()} chars total)
          </span>
        )}
      </div>
      
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="mt-3 space-y-2">
          {msg.toolCalls.map((tc, i) => (
            <ToolCallBlock key={tc.id || i} toolCall={tc} darkMode={darkMode} />
          ))}
        </div>
      )}
      
      {isAssistant && msg.usage && (
        <div className={`mt-4 pt-3 border-t text-xs flex flex-wrap gap-4 ${
          darkMode ? 'border-neutral-700/50 text-neutral-500' : 'border-neutral-200 text-neutral-400'
        }`}>
          <span className="flex items-center gap-1">
            <BarChart2 className="w-3 h-3" />
            {formatTokens(msg.usage.totalTokens)} tokens
          </span>
          {msg.usage.cost && (
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              {formatCost(msg.usage.cost.total)}
            </span>
          )}
          {msg.model && (
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              {msg.model}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

function TranscriptView({ session, darkMode }: { session: SessionDetail | null; darkMode: boolean }) {
  if (!session) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${
        darkMode ? 'text-neutral-500' : 'text-neutral-400'
      }`}>
        <ClipboardList className="w-16 h-16 mb-4 opacity-50" />
        <div className="text-lg font-medium">Select a session to view transcript</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`border-b p-5 ${darkMode ? 'bg-neutral-800/30 border-neutral-700/50' : 'bg-neutral-50 border-neutral-200'}`}>
        <div className="flex items-center gap-2">
          <h2 className={`font-bold text-lg tracking-tight ${darkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>
            {session.label}
          </h2>
          {session.isSubagent && (
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex items-center gap-1 ${
              darkMode ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'
            }`}>
              <Bot className="w-3 h-3" />
              sub-agent
            </span>
          )}
        </div>
        <div className={`text-sm flex flex-wrap gap-4 mt-2 ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
          <span className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            {session.totalMessages} messages
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4" />
            {formatTokens(session.totalTokens)} tokens
          </span>
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-4 h-4" />
            {formatCost(session.totalCost)}
          </span>
          <span className="flex items-center gap-1.5">
            <Brain className="w-4 h-4" />
            {session.model}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <AnimatePresence>
          {session.transcript.map((msg, idx) => (
            <MessageBubble key={idx} msg={msg} darkMode={darkMode} index={idx} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'subagent' | 'active'>('active'); // Default to active
  const [showCompleted, setShowCompleted] = useState(false); // Toggle for completed sessions
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.sessions);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessionDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      const data = await res.json();
      setSelectedSession(data);
    } catch (err) {
      console.error('Failed to fetch session:', err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions, autoRefresh]);

  useEffect(() => {
    if (!selectedId) return;
    fetchSessionDetail(selectedId);
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchSessionDetail(selectedId), 10000);
    return () => clearInterval(interval);
  }, [selectedId, fetchSessionDetail, autoRefresh]);

  const filteredSessions = sessions.filter(s => {
    // First, apply the main filter
    if (filter === 'subagent' && !s.isSubagent) return false;
    if (filter === 'active' && s.status !== 'active') return false;
    
    // Then, unless "show completed" is on, hide completed sessions
    if (!showCompleted && s.status === 'completed' && filter !== 'all') return false;
    
    return true;
  });

  const stats = {
    total: sessions.length,
    subagents: sessions.filter(s => s.isSubagent).length,
    active: sessions.filter(s => s.status === 'active').length
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-[#0a0a0b]' : 'bg-neutral-100'}`}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`text-xl flex flex-col items-center ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}
        >
          <RefreshCw className="w-10 h-10 mb-4 animate-spin" />
          <span className="font-medium">Loading sessions...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'bg-[#0a0a0b]' : 'bg-neutral-100'}`}>
      <header className={`border-b ${darkMode ? 'bg-neutral-900/80 border-neutral-800' : 'bg-white border-neutral-200'}`}>
        <div className="max-w-[1800px] mx-auto px-6 py-5">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-2 ${darkMode ? 'text-[#ececec]' : 'text-neutral-800'}`}>
                <Bot className="w-7 h-7" />
                Sub-Agent Dashboard
              </h1>
              <div className={`text-xs mt-1.5 flex items-center gap-1 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                <Clock className="w-3 h-3" />
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter buttons */}
              <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-neutral-800/50' : 'bg-neutral-200/50'}`}>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    filter === 'all'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : darkMode 
                        ? 'text-neutral-400 hover:text-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-800'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  All ({stats.total})
                </button>
                <button
                  onClick={() => setFilter('subagent')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    filter === 'subagent'
                      ? 'bg-purple-500 text-white shadow-sm'
                      : darkMode 
                        ? 'text-neutral-400 hover:text-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-800'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  Sub-Agents ({stats.subagents})
                </button>
                <button
                  onClick={() => setFilter('active')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    filter === 'active'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : darkMode 
                        ? 'text-neutral-400 hover:text-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-800'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  Active ({stats.active})
                </button>
              </div>
              
              {/* Show completed toggle */}
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border ${
                  showCompleted
                    ? darkMode 
                      ? 'bg-neutral-700 text-neutral-200 border-neutral-600'
                      : 'bg-neutral-200 text-neutral-700 border-neutral-300'
                    : darkMode 
                      ? 'text-neutral-500 border-neutral-700 hover:border-neutral-600'
                      : 'text-neutral-500 border-neutral-300 hover:border-neutral-400'
                }`}
              >
                {showCompleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showCompleted ? 'Showing All' : 'Show Completed'}
              </button>
              
              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border ${
                    autoRefresh
                      ? darkMode 
                        ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : darkMode 
                        ? 'text-neutral-500 border-neutral-700'
                        : 'text-neutral-500 border-neutral-300'
                  }`}
                >
                  {autoRefresh ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  Auto-refresh
                </button>
                
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`p-2 rounded-lg text-sm font-medium transition-all border ${
                    darkMode 
                      ? 'text-amber-400 border-neutral-700 hover:border-neutral-600'
                      : 'text-neutral-600 border-neutral-300 hover:border-neutral-400'
                  }`}
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                
                <button
                  onClick={fetchSessions}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border ${
                    darkMode 
                      ? 'text-neutral-400 border-neutral-700 hover:border-neutral-600 hover:text-neutral-200'
                      : 'text-neutral-600 border-neutral-300 hover:border-neutral-400'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-[1800px] mx-auto px-6 py-3"
          >
            <div className={`px-4 py-3 rounded-xl flex items-center gap-2 ${
              darkMode ? 'bg-red-950/50 text-red-300 border border-red-800/50' : 'bg-red-100 text-red-700 border border-red-200'
            }`}>
              <AlertTriangle className="w-4 h-4" />
              {error} - Make sure the server is running on port 3001
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-160px)]">
          {/* Session List */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 overflow-y-auto space-y-3 pr-2">
            {loading ? (
              <LoadingSkeleton darkMode={darkMode} />
            ) : filteredSessions.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-center py-12 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}
              >
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No sessions found</p>
                <p className="text-sm mt-1">Try changing the filter</p>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isSelected={selectedId === session.id}
                    onClick={() => setSelectedId(session.id)}
                    darkMode={darkMode}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Transcript View */}
          <motion.div 
            layout
            className={`col-span-12 md:col-span-8 lg:col-span-9 rounded-2xl overflow-hidden border ${
              darkMode ? 'bg-neutral-900/50 border-neutral-800' : 'bg-white border-neutral-200'
            }`}
          >
            <TranscriptView session={selectedSession} darkMode={darkMode} />
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default App;
