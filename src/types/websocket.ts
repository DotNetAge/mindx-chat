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

  // --- GoReact tool execution events (严格对齐 goreact/events/types.go) ---
  // 这些类型与后端 gateway RespToolXxx 恒等映射，不再有中间层篡改
  ToolUseDelta = 'tool_use_delta',
  ToolExecStart = 'tool_exec_start',
  ToolExecEnd = 'tool_exec_end',

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
  FSList = 'fs_list',
  FSHome = 'fs_home',

  // File events
  FileModified = 'file_modified',
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

// SessionMessage — 与 goreact/session.Message 完全对齐
// 来源: session.get RPC → handleSessionGet → []goreactsession.Message → JSON
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning_content?: string; // thinking/reasoning stream (DeepSeek-R1 etc.)
  timestamp: number;
  tool_call_id?: string;     // for role="tool" messages
  tool_calls?: Array<{       // for role="assistant" messages, GoReact 扁平格式
    id: string;
    name: string;
    arguments: string;
  }>;
}

export interface ServerSessionInfo {
  session_id: string;
  agent_name?: string;
  title?: string;
  project_dir?: string;
  session_dir?: string;
  messages?: SessionMessage[];
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

// --- Token Usage Statistics Types ---

export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  request_count: number;
  model: string;
}

export interface ModelUsageSummary {
  model: string;
  provider: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  request_count: number;
  avg_tokens_per_request: number;
}

export interface MonthlyUsageStats {
  year: number;
  month: number;
  total_cost: number;
  total_tokens: number;
  total_requests: number;
  daily_usage: DailyUsage[];
  model_breakdown: ModelUsageSummary[];
}

export interface TokenUsageOverview {
  current_month: MonthlyUsageStats;
  previous_month?: MonthlyUsageStats;
  available_models: string[];
}

export interface ProviderInfo {
  name: string;
  title: string;
  base_url: string;
  api_key: boolean;
  is_local: boolean;
}

export interface ProviderCreateParams {
  name: string;
  title: string;
  base_url: string;
  api_key: string;
  auth_token?: string;
  is_local?: boolean;
}

export interface ProviderUpdateParams {
  name: string;
  title?: string;
  base_url?: string;
  api_key?: string;
  auth_token?: string;
  is_local?: boolean;
}

export interface ModelCreateParams {
  name: string;
  title: string;
  description?: string;
  provider: string;
  base_url?: string;
  api_key?: string;
  auth_token?: string;
  max_tokens?: number;
  context_length?: number;
  is_local?: boolean;
  func_calling?: boolean;
  structuring?: boolean;
  web_searching?: boolean;
  prefix_con?: boolean;
  context_cache?: boolean;
  top_p?: number;
  top_k?: number;
  temperature?: number;
  repetition_penalty?: number;
  frequency_penalty?: number;
  enabled?: boolean;
  max_turns?: number;
  cost_per_1m_in?: number;
  cost_per_1m_out?: number;
}

export interface ModelUpdateParams {
  name: string;
  title?: string;
  description?: string;
  provider?: string;
  base_url?: string;
  api_key?: string;
  auth_token?: string;
  max_tokens?: number | null;
  context_length?: number | null;
  is_local?: boolean | null;
  func_calling?: boolean | null;
  structuring?: boolean | null;
  web_searching?: boolean | null;
  prefix_con?: boolean | null;
  context_cache?: boolean | null;
  top_p?: number | null;
  top_k?: number | null;
  temperature?: number | null;
  repetition_penalty?: number | null;
  frequency_penalty?: number | null;
  enabled?: boolean | null;
  max_turns?: number | null;
  cost_per_1m_in?: number | null;
  cost_per_1m_out?: number | null;
}

// ============================================================================
// GoReact 工具执行事件数据结构（严格对齐 goreact/events/*.go）
// 这些是后端透传的原始数据，前端直接消费，不做任何中间层转换
// ============================================================================

/** ToolUseDelta — LLM 流式输出工具调用参数片段
 *  来源: goreact/events/tool_use_delta.go → ToolUseDeltaData
 *  触发时机: LLM 返回 tool_call 时逐 chunk 发送
 */
export interface ToolUseDeltaData {
  index: number
  id: string
  name: string
  arguments: string
}

/** ToolExecStart — 工具即将开始执行
 *  来源: goreact/events/tool_exec.go → ToolExecStartData
 *  触发时机: executeSingleTool() 在工具执行前 emit
 */
export interface ToolExecStartData {
  tool_name: string
  params: Record<string, any>
  predicted_tokens: number
}

/** ToolExecEnd — 工具执行结束（成功或失败）
 *  来源: goreact/events/tool_exec.go → ToolExecEndData
 *  触发时机: executeSingleTool() 在工具执行后 emit
 */
export interface ToolExecEndData {
  tool_name: string
  tool_call_id: string
  success: boolean
  result: string
  error: string
  duration_ms: number
}

/** FileModified — 文件修改通知（在 ToolExecEnd 之后发送）
 *  来源: daemon 在 ToolExecEnd 后发射 RespFileModified
 *  触发时机: 工具执行成功后，文件被实际修改
 */
export interface FileModifiedData {
  files: Array<{
    path: string
    diff: string
    additions: number
    deletions: number
    isNew: boolean
  }>
}
