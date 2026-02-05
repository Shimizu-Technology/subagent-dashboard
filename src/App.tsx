import { useState, useEffect, useCallback } from 'react';

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
}

const API_URL = 'http://localhost:3001/api';

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
    active: 'bg-green-500 animate-pulse',
    completed: 'bg-gray-400 dark:bg-gray-600',
    unknown: 'bg-yellow-500'
  };
  
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status as keyof typeof colors] || colors.unknown}`} />
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
      className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border-2 shadow-sm hover:shadow-md ${
        isSelected 
          ? darkMode 
            ? 'border-blue-400 bg-blue-900/30' 
            : 'border-blue-500 bg-blue-50'
          : darkMode
            ? 'border-gray-700 bg-gray-800 hover:border-blue-500/50'
            : 'border-gray-200 bg-white hover:border-blue-300'
      } ${session.isSubagent ? darkMode ? 'ring-2 ring-purple-500/50' : 'ring-2 ring-purple-400' : ''}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={session.status} />
          <h3 className={`font-semibold truncate flex-1 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            {session.label || session.id.slice(0, 8)}
          </h3>
        </div>
        {session.isSubagent && (
          <span className={`ml-2 px-2 py-1 text-xs rounded-full font-medium ${
            darkMode ? 'bg-purple-900 text-purple-300' : 'bg-purple-100 text-purple-700'
          }`}>
            sub-agent
          </span>
        )}
      </div>
      
      <div className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        {session.model}
      </div>
      
      <div className={`text-sm space-y-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        <div className="flex justify-between">
          <span>Messages:</span>
          <span className="font-medium">{session.messageCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Tokens:</span>
          <span className="font-medium">{formatTokens(session.totalTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span>Cost:</span>
          <span className="font-medium">{formatCost(session.totalCost)}</span>
        </div>
        <div className="flex justify-between">
          <span>Last activity:</span>
          <span className="font-medium">{timeSince(session.lastActivity)}</span>
        </div>
      </div>
      
      <div className={`mt-2 text-xs truncate font-mono ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
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
    <div className={`mt-2 rounded-lg p-3 font-mono text-xs ${
      darkMode ? 'bg-amber-900/30 border border-amber-700/50' : 'bg-amber-50 border border-amber-200'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
          darkMode ? 'bg-amber-800 text-amber-200' : 'bg-amber-200 text-amber-800'
        }`}>
          🔧 {toolCall.name}
        </span>
        {isLong && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className={`text-xs underline ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}
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

function MessageBubble({ msg, darkMode }: { msg: TranscriptMessage; darkMode: boolean }) {
  const isUser = msg.role === 'user';
  const isTool = msg.role === 'tool';
  const isAssistant = msg.role === 'assistant';
  
  let bgClass = '';
  let textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  
  if (isUser) {
    bgClass = darkMode ? 'bg-blue-800/50' : 'bg-blue-100';
  } else if (isTool) {
    bgClass = darkMode ? 'bg-gray-700/50' : 'bg-gray-100';
    textClass = darkMode ? 'text-gray-300' : 'text-gray-700';
  } else {
    bgClass = darkMode ? 'bg-gray-800' : 'bg-white border border-gray-200';
  }
  
  return (
    <div className={`p-4 rounded-xl ${bgClass} ${isUser ? 'ml-12' : isTool ? 'mx-6' : 'mr-12'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {isUser ? '👤 User' : isTool ? `⚡ ${msg.toolResult?.toolName || 'Tool'}` : '🤖 Assistant'}
          {msg.isThinking && ' (thinking)'}
        </span>
        {msg.timestamp && (
          <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      
      <div className={`text-sm whitespace-pre-wrap break-words ${textClass}`}>
        {msg.content.slice(0, 3000)}
        {msg.content.length > 3000 && (
          <span className={`italic ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
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
        <div className={`mt-3 pt-2 border-t text-xs flex gap-4 ${
          darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'
        }`}>
          <span>📊 {formatTokens(msg.usage.totalTokens)} tokens</span>
          {msg.usage.cost && <span>💰 {formatCost(msg.usage.cost.total)}</span>}
          {msg.model && <span>🧠 {msg.model}</span>}
        </div>
      )}
    </div>
  );
}

function TranscriptView({ session, darkMode }: { session: SessionDetail | null; darkMode: boolean }) {
  if (!session) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${
        darkMode ? 'text-gray-500' : 'text-gray-400'
      }`}>
        <div className="text-6xl mb-4">📋</div>
        <div className="text-lg">Select a session to view transcript</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`border-b p-4 ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <h2 className={`font-bold text-lg ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
          {session.label}
        </h2>
        <div className={`text-sm flex flex-wrap gap-4 mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <span>📝 {session.totalMessages} messages</span>
          <span>📊 {formatTokens(session.totalTokens)} tokens</span>
          <span>💰 {formatCost(session.totalCost)}</span>
          <span>🧠 {session.model}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.transcript.map((msg, idx) => (
          <MessageBubble key={idx} msg={msg} darkMode={darkMode} />
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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'subagent' | 'active'>('all');
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
    if (filter === 'subagent') return s.isSubagent;
    if (filter === 'active') return s.status === 'active';
    return true;
  });

  const stats = {
    total: sessions.length,
    subagents: sessions.filter(s => s.isSubagent).length,
    active: sessions.filter(s => s.status === 'active').length
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
        <div className={`text-xl ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="animate-spin text-4xl mb-4">🔄</div>
          Loading sessions...
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <header className={`shadow-sm border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                🤖 Sub-Agent Dashboard
              </h1>
              <div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter buttons */}
              <div className="flex gap-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filter === 'all'
                      ? 'bg-blue-500 text-white'
                      : darkMode 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All ({stats.total})
                </button>
                <button
                  onClick={() => setFilter('subagent')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filter === 'subagent'
                      ? 'bg-purple-500 text-white'
                      : darkMode 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Sub-Agents ({stats.subagents})
                </button>
                <button
                  onClick={() => setFilter('active')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filter === 'active'
                      ? 'bg-green-500 text-white'
                      : darkMode 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Active ({stats.active})
                </button>
              </div>
              
              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                    autoRefresh
                      ? darkMode 
                        ? 'bg-green-800 text-green-200'
                        : 'bg-green-100 text-green-700'
                      : darkMode 
                        ? 'bg-gray-700 text-gray-400'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {autoRefresh ? '🔄' : '⏸️'} Auto-refresh
                </button>
                
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    darkMode 
                      ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>
                
                <button
                  onClick={fetchSessions}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    darkMode 
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  ↻ Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className={`px-4 py-2 rounded-lg ${
            darkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
          }`}>
            ⚠️ {error} - Make sure the server is running on port 3001
          </div>
        </div>
      )}

      <main className="max-w-[1800px] mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-160px)]">
          {/* Session List */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 overflow-y-auto space-y-3 pr-2">
            {filteredSessions.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <div className="text-4xl mb-2">📭</div>
                No sessions found
              </div>
            ) : (
              filteredSessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isSelected={selectedId === session.id}
                  onClick={() => setSelectedId(session.id)}
                  darkMode={darkMode}
                />
              ))
            )}
          </div>

          {/* Transcript View */}
          <div className={`col-span-12 md:col-span-8 lg:col-span-9 rounded-xl shadow-lg overflow-hidden ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <TranscriptView session={selectedSession} darkMode={darkMode} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
