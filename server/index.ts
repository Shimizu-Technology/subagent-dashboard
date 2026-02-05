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

/**
 * Detect if a session is a subagent by checking:
 * 1. If the content contains "# Subagent Context" (injected into subagent prompts)
 * 2. If the content contains session key patterns like "agent:main:subagent:"
 * 3. If the label contains "subagent"
 */
function detectSubagent(content: string, label: string): boolean {
  // Check label first (fastest)
  if (label.toLowerCase().includes('subagent')) {
    return true;
  }
  
  // Check for subagent context marker in the content
  // This is injected into subagent sessions as part of the system prompt
  if (content.includes('# Subagent Context') || content.includes('## Subagent Context')) {
    return true;
  }
  
  // Check for session key pattern in tool results
  // When sessions are listed, subagent session keys contain "subagent"
  // Pattern: "key":"agent:main:subagent:UUID" or "Your session: agent:main:subagent:"
  const subagentKeyPattern = /["']?key["']?\s*:\s*["']agent:main:subagent:/i;
  const yourSessionPattern = /Your session:\s*agent:main:subagent:/i;
  
  if (subagentKeyPattern.test(content) || yourSessionPattern.test(content)) {
    // This is a parent session that spawned subagents, not a subagent itself
    // We want to detect the actual subagent sessions
    // But if the session's own info shows it's a subagent, that's different
  }
  
  // Check for sessions_list tool results that show this session as a subagent
  // The pattern "childSessionKey":"agent:main:subagent:" appears in spawn results
  // But those identify OTHER sessions, not THIS one
  
  // Check if this session was the target of a spawn
  // Look for specific patterns that indicate this is a subagent session:
  // - Single user message with a task
  // - No heartbeat patterns
  // - Contains task markers like "## " or "Task:" in first message
  
  return false;
}

function extractLabel(entries: SessionEntry[], filename: string, content: string): string {
  // Check for label in custom data
  for (const entry of entries) {
    if (entry.type === 'custom' && entry.data && typeof entry.data.label === 'string') {
      return entry.data.label;
    }
  }
  
  // Check for task marker in first user message (this is most reliable for subagents)
  const firstUserMsg = entries.find(e => e.type === 'message' && e.message?.role === 'user');
  if (firstUserMsg?.message?.content) {
    const msgContent = typeof firstUserMsg.message.content === 'string' 
      ? firstUserMsg.message.content 
      : firstUserMsg.message.content.map(b => b.text || '').join('');
    
    // Extract subagent label from "- Label: <label>" pattern (in Subagent Context section)
    const subagentLabelMatch = msgContent.match(/- Label:\s*([^\n]+)/);
    if (subagentLabelMatch) {
      return subagentLabelMatch[1].trim();
    }
    
    // Extract task title from ## header (common for task messages)
    const taskMatch = msgContent.match(/##\s+([^\n]+)/);
    if (taskMatch) {
      const title = taskMatch[1].trim();
      // Clean up common patterns like "(JRY-63 Polish)" at the end
      const cleanTitle = title.replace(/\s*\([^)]+\)\s*$/, '').slice(0, 40).trim();
      if (cleanTitle.length > 3) {
        return cleanTitle;
      }
    }
    
    // Extract from cron job pattern: [cron:UUID Name]
    const cronMatch = msgContent.match(/\[cron:[a-f0-9-]+\s+([^\]]+)\]/i);
    if (cronMatch) {
      return cronMatch[1].trim();
    }
  }
  
  // Check session entry for cwd-based label (fallback)
  for (const entry of entries) {
    if (entry.type === 'session' && entry.cwd) {
      const cwdParts = entry.cwd.split('/');
      const cwdLabel = cwdParts[cwdParts.length - 1] || 'session';
      // Skip generic labels
      if (cwdLabel !== 'clawd' && cwdLabel !== 'home' && cwdLabel !== 'clawdbot' && cwdLabel !== 'jerry') {
        return cwdLabel;
      }
    }
  }
  
  // Try to extract label from sessions_list output if this session appears there
  const sessionId = filename.replace('.jsonl', '');
  const labelPattern = new RegExp(`"sessionId"\\s*:\\s*"${sessionId}"[^}]*"label"\\s*:\\s*"([^"]+)"`, 'i');
  const match = content.match(labelPattern);
  if (match) {
    return match[1];
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
      // Check if it was recent (within 2 minutes)
      const lastTime = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      const now = Date.now();
      if (now - lastTime < 2 * 60 * 1000) {
        return 'active';
      }
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
      
      const label = extractLabel(entries, file, content);
      const model = extractModel(entries);
      const { tokens, cost } = extractUsageTotals(entries);
      const status = extractStatus(entries);
      
      // Improved subagent detection
      const isSubagent = detectSubagent(content, label);
      
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

    const label = extractLabel(entries, `${sessionId}.jsonl`, content);
    const model = extractModel(entries);
    const { tokens, cost } = extractUsageTotals(entries);
    const isSubagent = detectSubagent(content, label);

    res.json({
      id: sessionId,
      label,
      model,
      totalTokens: tokens,
      totalCost: cost,
      transcript,
      totalMessages: transcript.length,
      isSubagent
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sub-Agent Dashboard API running on http://localhost:${PORT}`);
});
