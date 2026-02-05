import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3001;

// OpenClaw sessions directory
const SESSIONS_DIR = '/Users/jerry/.openclaw/agents/main/sessions/';

app.use(cors());
app.use(express.json());

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface SessionEntry {
  type: string;
  id?: string;
  timestamp?: string;
  customType?: string;
  data?: Record<string, unknown>;
  message?: {
    role: string;
    content: string | ContentBlock[];
    usage?: Usage;
    model?: string;
    stopReason?: string;
    toolCallId?: string;
    toolName?: string;
  };
  cwd?: string;
  provider?: string;
  modelId?: string;
}

interface SessionInfo {
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

function parseJSONL(content: string): SessionEntry[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  const entries: SessionEntry[] = [];
  
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip invalid JSON lines
    }
  }
  
  return entries;
}

function extractLabel(entries: SessionEntry[], filename: string): string {
  // Check for label in custom data
  for (const entry of entries) {
    if (entry.type === 'custom' && entry.data && typeof entry.data.label === 'string') {
      return entry.data.label;
    }
  }
  
  // Check session entry for cwd-based label
  for (const entry of entries) {
    if (entry.type === 'session' && entry.cwd) {
      const cwdParts = entry.cwd.split('/');
      return cwdParts[cwdParts.length - 1] || 'session';
    }
  }
  
  // Extract from filename if it's a subagent
  if (filename.includes('subagent')) {
    const match = filename.match(/subagent:([^.]+)/);
    if (match) return `subagent:${match[1].slice(0, 8)}`;
  }
  
  return filename.replace('.jsonl', '').slice(0, 12);
}

function extractModel(entries: SessionEntry[]): string {
  for (const entry of entries) {
    if (entry.type === 'model_change' && entry.modelId) {
      return entry.modelId;
    }
    if (entry.type === 'message' && entry.message?.model) {
      return entry.message.model;
    }
  }
  return 'unknown';
}

function extractUsageTotals(entries: SessionEntry[]): { tokens: number; cost: number } {
  let tokens = 0;
  let cost = 0;
  
  for (const entry of entries) {
    if (entry.type === 'message' && entry.message?.usage) {
      tokens += entry.message.usage.totalTokens || 0;
      cost += entry.message.usage.cost?.total || 0;
    }
  }
  
  return { tokens, cost };
}

function extractStatus(entries: SessionEntry[]): 'active' | 'completed' | 'unknown' {
  // Check last few entries for completion indicators
  const lastEntries = entries.slice(-5);
  
  for (const entry of lastEntries) {
    if (entry.type === 'message' && entry.message?.stopReason === 'end_turn') {
      return 'completed';
    }
  }
  
  // If last message was within 5 minutes, consider active
  const lastEntry = entries[entries.length - 1];
  if (lastEntry?.timestamp) {
    const lastTime = new Date(lastEntry.timestamp).getTime();
    const now = Date.now();
    if (now - lastTime < 5 * 60 * 1000) {
      return 'active';
    }
  }
  
  return 'completed';
}

function extractContent(content: string | ContentBlock[]): { text: string; toolCalls: ToolCall[]; hasThinking: boolean } {
  if (typeof content === 'string') {
    return { text: content, toolCalls: [], hasThinking: false };
  }
  
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];
    let hasThinking = false;
    
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      } else if (block.type === 'thinking') {
        hasThinking = true;
        // Optionally include thinking in output
        if (block.thinking) {
          textParts.push(`[Thinking: ${block.thinking.slice(0, 200)}${block.thinking.length > 200 ? '...' : ''}]`);
        }
      } else if (block.type === 'toolCall' && block.name) {
        toolCalls.push({
          id: block.id || '',
          name: block.name,
          arguments: block.arguments || {}
        });
      }
    }
    
    return { text: textParts.join('\n'), toolCalls, hasThinking };
  }
  
  return { text: '', toolCalls: [], hasThinking: false };
}

// GET /api/sessions - List all sessions
app.get('/api/sessions', (_req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      return res.json({ sessions: [] });
    }

    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(SESSIONS_DIR, a));
        const statB = fs.statSync(path.join(SESSIONS_DIR, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    const sessions: SessionInfo[] = [];

    for (const file of files.slice(0, 100)) { // Limit to 100 most recent
      const filepath = path.join(SESSIONS_DIR, file);
      const stat = fs.statSync(filepath);
      const content = fs.readFileSync(filepath, 'utf-8');
      const entries = parseJSONL(content);
      
      const label = extractLabel(entries, file);
      const isSubagent = file.includes('subagent') || label.includes('subagent');
      const model = extractModel(entries);
      const { tokens, cost } = extractUsageTotals(entries);
      const status = extractStatus(entries);
      
      // Find first timestamp
      let startTime = stat.birthtime.toISOString();
      for (const entry of entries) {
        if (entry.timestamp) {
          startTime = entry.timestamp;
          break;
        }
      }

      sessions.push({
        id: file.replace('.jsonl', ''),
        filename: file,
        label,
        startTime,
        messageCount: entries.filter(e => e.type === 'message' && e.message).length,
        lastActivity: stat.mtime.toISOString(),
        isSubagent,
        status,
        model,
        totalTokens: tokens,
        totalCost: cost
      });
    }

    res.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /api/sessions/:id - Get session transcript
app.get('/api/sessions/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    const filepath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const entries = parseJSONL(content);
    
    const transcript: TranscriptMessage[] = [];
    
    for (const entry of entries) {
      if (entry.type !== 'message' || !entry.message) continue;
      
      const msg = entry.message;
      
      if (msg.role === 'user' || msg.role === 'assistant') {
        const { text, toolCalls, hasThinking } = extractContent(msg.content);
        
        transcript.push({
          role: msg.role,
          content: text,
          timestamp: entry.timestamp || null,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          usage: msg.usage,
          model: msg.model,
          isThinking: hasThinking
        });
      } else if (msg.role === 'toolResult') {
        const { text } = extractContent(msg.content);
        transcript.push({
          role: 'tool',
          content: text.slice(0, 5000) + (text.length > 5000 ? '... (truncated)' : ''),
          timestamp: entry.timestamp || null,
          toolResult: {
            toolName: msg.toolName || 'unknown',
            isError: false
          }
        });
      }
    }

    const label = extractLabel(entries, `${sessionId}.jsonl`);
    const model = extractModel(entries);
    const { tokens, cost } = extractUsageTotals(entries);

    res.json({
      id: sessionId,
      label,
      model,
      totalTokens: tokens,
      totalCost: cost,
      transcript,
      totalMessages: transcript.length
    });
  } catch (error) {
    console.error('Error reading session:', error);
    res.status(500).json({ error: 'Failed to read session' });
  }
});

// POST /api/sessions/:id/kill - Placeholder for kill functionality
app.post('/api/sessions/:id/kill', (req, res) => {
  const sessionId = req.params.id;
  // Placeholder - in the future, this could send a signal to stop the session
  console.log(`Kill requested for session: ${sessionId}`);
  res.json({ message: 'Kill request received (placeholder)', sessionId });
});

app.listen(PORT, () => {
  console.log(`🤖 Sub-Agent Dashboard API running on http://localhost:${PORT}`);
});
