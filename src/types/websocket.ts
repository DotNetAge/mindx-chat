export enum ResponseType {
  Text = 'text',
  Table = 'table',
  Todo = 'todo',
  Options = 'options',
  Form = 'form',
  Progress = 'progress',
  Error = 'error',
  Confirm = 'confirm',
  File = 'file',
  Markdown = 'markdown',

  ThinkingDelta = 'thinking_delta',
  ThinkingDone = 'thinking_done',
  ActionStart = 'action_start',
  ActionProgress = 'action_progress',
  ActionResult = 'action_result',
  ActionEnd = 'action_end',
  SubtaskSpawned = 'subtask_spawned',
  SubtaskCompleted = 'subtask_completed',
  FinalAnswer = 'final_answer',
  ClarifyNeeded = 'clarify_needed',
  PermissionRequest = 'permission_request',
  PermissionDenied = 'permission_denied',
  ExecutionSummary = 'execution_summary',
  CycleEnd = 'cycle_end',
  TaskSummary = 'task_summary',
  SessionList = 'session_list',
  SessionInfo = 'session_info',
  MemoryResult = 'memory_result',
  AgentList = 'agent_list',
  ModelList = 'model_list',
  SkillList = 'skill_list',

  AgentTalkStart = 'agent_talk_start',
  AgentTalkEnd = 'agent_talk_end',
  Compaction = 'compaction',
  MaxTurnsReached = 'max_turns_reached',
  ContentDelta = 'content_delta',
  ToolUseDelta = 'tool_use_delta',
  FSList = 'fs_list',
  FSHome = 'fs_home'
}

export interface ResponseEnvelope {
  type: ResponseType;
  id?: string;
  session_id?: string;
  title?: string;
  data?: any;
  meta?: Record<string, any>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface EventEnvelope {
  data: any;
  session_id?: string;
  title?: string;
  meta?: Record<string, any>;
  type: string;
}

export type MessageHandler = (envelope: EventEnvelope) => void;

export interface ConnectionConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

// --- Daemon RPC Response Types (matching backend structs) ---

export interface AgentConfig {
  name: string;
  role?: string;
  description: string;
  introduction?: string;
  model: string;
  skills?: string[];
  body?: string;
  meta?: Record<string, any>;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

export interface ServerSessionInfo {
  session_id: string;
  agent_name?: string;
  project_dir?: string;
  session_dir?: string;
  messages: SessionMessage[];
  last_activity_at: string;
  created_at: string;
}

export interface ModelConfig {
  name: string;
  title?: string;
  description: string;
  provider: string;
  base_url?: string;
  max_tokens?: number;
  context_length?: number;
  func_calling?: boolean;
  structuring?: boolean;
  web_searching?: boolean;
  enabled?: boolean;
  temperature?: number;
  max_turns?: number;
}

export interface SkillInfo {
  name: string;
  description?: string;
}

export interface FSEntry {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  mode: string;
  mod_time: string;
}
