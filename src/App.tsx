import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
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
  EyeOff,
  Menu,
  ArrowLeft,
  ChevronUp,
  Loader2
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

// Constants for pagination
const INITIAL_MESSAGE_COUNT = 100;
const LOAD_MORE_COUNT = 100;

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

function TranscriptLoadingSkeleton({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="p-5 space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`p-5 rounded-2xl border animate-pulse ${
            darkMode 
              ? 'bg-neutral-800/50 border-neutral-700/50' 
              : 'bg-white border-neutral-200'
          } ${i % 2 === 0 ? 'ml-12' : 'mr-12'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-3.5 h-3.5 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
            <div className={`h-3 w-16 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
          </div>
          <div className="space-y-2">
            <div className={`h-4 w-full rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
            <div className={`h-4 w-3/4 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
            <div className={`h-4 w-1/2 rounded ${darkMode ? 'bg-neutral-700' : 'bg-neutral-200'}`} />
          </div>
        </div>
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
    <div 
      onClick={onClick}
      className={`p-4 sm:p-5 rounded-2xl cursor-pointer transition-all duration-150 border
        active:scale-[0.98] active:opacity-80
        ${isSelected 
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
            <span className="hidden sm:inline">sub-agent</span>
          </span>
        )}
      </div>
      
      <div className={`text-xs mb-3 flex items-center gap-1.5 ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        <Brain className="w-3 h-3" />
        <span className="truncate">{session.model}</span>
      </div>
      
      <div className={`text-sm space-y-2 ${darkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Messages</span>
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{session.messageCount}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tokens</span>
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{formatTokens(session.totalTokens)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cost</span>
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{formatCost(session.totalCost)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Last activity</span>
          </span>
          <span className={`font-medium ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{timeSince(session.lastActivity)}</span>
        </div>
      </div>
      
      <div className={`mt-3 pt-3 text-xs truncate font-mono border-t ${
        darkMode ? 'text-neutral-600 border-neutral-700/50' : 'text-neutral-400 border-neutral-200'
      }`}>
        {session.id.slice(0, 20)}...
      </div>
    </div>
  );
}

function ToolCallBlock({ toolCall, darkMode }: { toolCall: ToolCall; darkMode: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const isLong = argsStr.length > 100;
  
  return (
    <div 
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
    </div>
  );
}

// Memoized markdown component to avoid re-renders
const MemoizedMarkdown = memo(function MemoizedMarkdown({ 
  content, 
  darkMode 
}: { 
  content: string; 
  darkMode: boolean;
}) {
  // Truncate very long content for performance
  const displayContent = content.length > 3000 ? content.slice(0, 3000) : content;
  const truncated = content.length > 3000;
  
  return (
    <>
      <ReactMarkdown
        components={{
          h1: ({children}) => <h1 className={`text-lg font-bold mb-2 ${darkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>{children}</h1>,
          h2: ({children}) => <h2 className={`text-base font-semibold mb-2 ${darkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>{children}</h2>,
          h3: ({children}) => <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{children}</h3>,
          p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({children}) => <li className="ml-2">{children}</li>,
          code: ({className, children}) => {
            const isInline = !className;
            return isInline 
              ? <code className={`px-1 py-0.5 rounded text-xs font-mono ${darkMode ? 'bg-neutral-700 text-amber-300' : 'bg-neutral-200 text-amber-700'}`}>{children}</code>
              : <code className={`block p-3 rounded-lg text-xs font-mono overflow-x-auto ${darkMode ? 'bg-neutral-900 text-neutral-300' : 'bg-neutral-100 text-neutral-800'}`}>{children}</code>;
          },
          pre: ({children}) => <pre className="mb-2">{children}</pre>,
          strong: ({children}) => <strong className={`font-semibold ${darkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>{children}</strong>,
          a: ({href, children}) => <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
          blockquote: ({children}) => <blockquote className={`border-l-4 pl-3 italic my-2 ${darkMode ? 'border-neutral-600 text-neutral-400' : 'border-neutral-300 text-neutral-600'}`}>{children}</blockquote>,
        }}
      >
        {displayContent}
      </ReactMarkdown>
      {truncated && (
        <span className={`italic ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
          ... (truncated, {content.length.toLocaleString()} chars total)
        </span>
      )}
    </>
  );
});

// Memoized message bubble to prevent expensive re-renders
const MessageBubble = memo(function MessageBubble({ 
  msg, 
  darkMode 
}: { 
  msg: TranscriptMessage; 
  darkMode: boolean;
}) {
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
    <div 
      className={`p-4 sm:p-5 rounded-2xl border ${bgClass} ${isUser ? 'ml-4 sm:ml-12' : isTool ? 'mx-2 sm:mx-6' : 'mr-4 sm:mr-12'}`}
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
      
      <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${darkMode ? 'prose-invert' : ''} ${textClass}`}>
        <MemoizedMarkdown content={msg.content} darkMode={darkMode} />
      </div>
      
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="mt-3 space-y-2">
          {msg.toolCalls.map((tc, i) => (
            <ToolCallBlock key={tc.id || i} toolCall={tc} darkMode={darkMode} />
          ))}
        </div>
      )}
      
      {isAssistant && msg.usage && (
        <div className={`mt-4 pt-3 border-t text-xs flex flex-wrap gap-2 sm:gap-4 ${
          darkMode ? 'border-neutral-700/50 text-neutral-500' : 'border-neutral-200 text-neutral-400'
        }`}>
          <span className="flex items-center gap-1">
            <BarChart2 className="w-3 h-3" />
            {formatTokens(msg.usage.totalTokens)}
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
              <span className="truncate max-w-[100px] sm:max-w-none">{msg.model}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
});

function TranscriptView({ 
  session, 
  darkMode, 
  loading,
  onBack 
}: { 
  session: SessionDetail | null; 
  darkMode: boolean;
  loading: boolean;
  onBack?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevSessionId = useRef<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_MESSAGE_COUNT);

  // Reset display count when session changes
  useEffect(() => {
    if (session && prevSessionId.current !== session.id) {
      setDisplayCount(INITIAL_MESSAGE_COUNT);
      prevSessionId.current = session.id;
    }
  }, [session?.id]);

  // Auto-scroll to bottom when session changes or new messages arrive
  useEffect(() => {
    if (session && scrollRef.current && !loading) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.id, session?.transcript.length, loading]);

  // Calculate which messages to display (pagination from the end)
  const { displayedMessages, hiddenCount, totalCount } = useMemo(() => {
    if (!session) return { displayedMessages: [], hiddenCount: 0, totalCount: 0 };
    const total = session.transcript.length;
    const startIndex = Math.max(0, total - displayCount);
    return {
      displayedMessages: session.transcript.slice(startIndex),
      hiddenCount: startIndex,
      totalCount: total
    };
  }, [session, displayCount]);

  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + LOAD_MORE_COUNT);
  }, []);

  // Show loading skeleton
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        {onBack && (
          <div className={`border-b p-3 lg:hidden ${darkMode ? 'bg-neutral-800/30 border-neutral-700/50' : 'bg-neutral-50 border-neutral-200'}`}>
            <button
              onClick={onBack}
              className={`flex items-center gap-2 text-sm font-medium ${darkMode ? 'text-neutral-300' : 'text-neutral-600'}`}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sessions
            </button>
          </div>
        )}
        <div className={`border-b p-5 ${darkMode ? 'bg-neutral-800/30 border-neutral-700/50' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className="flex items-center gap-3">
            <Loader2 className={`w-5 h-5 animate-spin ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
            <span className={`font-medium ${darkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>Loading transcript...</span>
          </div>
        </div>
        <TranscriptLoadingSkeleton darkMode={darkMode} />
      </div>
    );
  }

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
      {/* Mobile back button */}
      {onBack && (
        <div className={`border-b p-3 lg:hidden ${darkMode ? 'bg-neutral-800/30 border-neutral-700/50' : 'bg-neutral-50 border-neutral-200'}`}>
          <button
            onClick={onBack}
            className={`flex items-center gap-2 text-sm font-medium ${darkMode ? 'text-neutral-300' : 'text-neutral-600'}`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sessions
          </button>
        </div>
      )}
      
      <div className={`border-b p-4 sm:p-5 ${darkMode ? 'bg-neutral-800/30 border-neutral-700/50' : 'bg-neutral-50 border-neutral-200'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className={`font-bold text-base sm:text-lg tracking-tight ${darkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>
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
        <div className={`text-sm flex flex-wrap gap-2 sm:gap-4 mt-2 ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
          <span className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            {session.totalMessages}
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4" />
            {formatTokens(session.totalTokens)}
          </span>
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-4 h-4" />
            {formatCost(session.totalCost)}
          </span>
          <span className="flex items-center gap-1.5 truncate">
            <Brain className="w-4 h-4" />
            <span className="truncate max-w-[150px] sm:max-w-none">{session.model}</span>
          </span>
        </div>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4">
        {/* Load more button at top */}
        {hiddenCount > 0 && (
          <button
            onClick={loadMore}
            className={`w-full py-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              darkMode 
                ? 'bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300'
                : 'bg-neutral-100 border-neutral-200 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            <ChevronUp className="w-4 h-4" />
            Load {Math.min(LOAD_MORE_COUNT, hiddenCount)} earlier messages
            <span className={`text-xs ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
              ({hiddenCount} hidden of {totalCount})
            </span>
          </button>
        )}
        
        {/* Messages - no AnimatePresence for performance */}
        {displayedMessages.map((msg, idx) => (
          <MessageBubble 
            key={`${session.id}-${hiddenCount + idx}`} 
            msg={msg} 
            darkMode={darkMode} 
          />
        ))}
      </div>
    </div>
  );
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'subagent' | 'active'>('active');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
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
    setTranscriptLoading(true);
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      const data = await res.json();
      setSelectedSession(data);
    } catch (err) {
      console.error('Failed to fetch session:', err);
    } finally {
      setTranscriptLoading(false);
    }
  }, []);

  // Immediate click handler - sets selection instantly
  const handleSessionClick = useCallback((id: string) => {
    setSelectedId(id);  // Immediate visual feedback
    setShowSidebar(false);  // Hide sidebar on mobile
    fetchSessionDetail(id);  // Start loading transcript
  }, [fetchSessionDetail]);

  // Back button handler for mobile
  const handleBack = useCallback(() => {
    setShowSidebar(true);
    setSelectedId(null);
    setSelectedSession(null);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions, autoRefresh]);

  // Auto-refresh selected session (but don't show loading spinner)
  useEffect(() => {
    if (!selectedId || !autoRefresh) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/sessions/${selectedId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedSession(data);
        }
      } catch {
        // Silent fail for background refresh
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedId, autoRefresh]);

  const filteredSessions = sessions.filter(s => {
    if (filter === 'subagent' && !s.isSubagent) return false;
    if (filter === 'active' && s.status !== 'active') return false;
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
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-wrap justify-between items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile menu toggle */}
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`lg:hidden p-2 rounded-lg border ${
                  darkMode 
                    ? 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
                    : 'border-neutral-300 text-neutral-600 hover:text-neutral-800'
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <div>
                <h1 className={`text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 ${darkMode ? 'text-[#ececec]' : 'text-neutral-800'}`}>
                  <Bot className="w-6 sm:w-7 h-6 sm:h-7" />
                  <span className="hidden sm:inline">Sub-Agent Dashboard</span>
                  <span className="sm:hidden">Dashboard</span>
                </h1>
                <div className={`text-xs mt-1 sm:mt-1.5 flex items-center gap-1 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                  <Clock className="w-3 h-3" />
                  {lastRefresh.toLocaleTimeString()}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Filter buttons - simplified on mobile */}
              <div className={`hidden sm:flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-neutral-800/50' : 'bg-neutral-200/50'}`}>
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
                  Sub ({stats.subagents})
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
              
              {/* Mobile filter dropdown */}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | 'subagent' | 'active')}
                className={`sm:hidden px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  darkMode 
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-200'
                    : 'bg-white border-neutral-300 text-neutral-700'
                }`}
              >
                <option value="all">All ({stats.total})</option>
                <option value="subagent">Sub-Agents ({stats.subagents})</option>
                <option value="active">Active ({stats.active})</option>
              </select>
              
              {/* Show completed toggle - icon only on mobile */}
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border ${
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
                <span className="hidden sm:inline">{showCompleted ? 'Showing All' : 'Show Completed'}</span>
              </button>
              
              {/* Controls */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border ${
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
                  <span className="hidden sm:inline">Auto</span>
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
                  className={`p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border ${
                    darkMode 
                      ? 'text-neutral-400 border-neutral-700 hover:border-neutral-600 hover:text-neutral-200'
                      : 'text-neutral-600 border-neutral-300 hover:border-neutral-400'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Refresh</span>
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
            className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3"
          >
            <div className={`px-4 py-3 rounded-xl flex items-center gap-2 text-sm ${
              darkMode ? 'bg-red-950/50 text-red-300 border border-red-800/50' : 'bg-red-100 text-red-700 border border-red-200'
            }`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{error} - Server on port 3001?</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 h-[calc(100vh-140px)] sm:h-[calc(100vh-160px)]">
          {/* Session List - full screen on mobile, sidebar on desktop */}
          <div className={`
            ${showSidebar ? 'block' : 'hidden'} 
            lg:block 
            w-full lg:w-1/3 xl:w-1/4 
            overflow-y-auto 
            space-y-3 
            pr-0 lg:pr-2
            ${selectedId && !showSidebar ? 'hidden' : ''}
          `}>
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
                    onClick={() => handleSessionClick(session.id)}
                    darkMode={darkMode}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Transcript View - full screen on mobile when selected */}
          <div 
            className={`
              ${!showSidebar || !selectedId ? 'block' : 'hidden lg:block'}
              flex-1 
              rounded-2xl 
              overflow-hidden 
              border 
              min-h-[300px]
              ${darkMode ? 'bg-neutral-900/50 border-neutral-800' : 'bg-white border-neutral-200'}
            `}
          >
            <TranscriptView 
              session={selectedSession} 
              darkMode={darkMode} 
              loading={transcriptLoading}
              onBack={handleBack}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
