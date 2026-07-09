export type MCPServerType = 'stdio' | 'sse' | 'http'

export interface MCPServerConfig {
  name: string
  type: MCPServerType
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  // sse / http
  url?: string
  // 凭据
  credential?: Record<string, string>
  idle_ttl_secs: number
}

export interface MCPServerListEntry {
  name: string
  type: string
  // stdio
  command?: string
  args?: string[]
  // sse / http
  url?: string
  // credential 仅返回 ref key，不返回值
  credential_ref?: string
  idle_ttl_secs: number
}

export interface MCPToolDef {
  name: string            // MCP 协议原始工具名
  description: string
  inputSchema: Record<string, any>
}

export interface MCPManifestEntry {
  name: string          // goharness tool name, e.g. "mcp:filesystem:read_file"
  server: string
  mcp_name: string
  description: string
  input_schema: Record<string, any>
}

export interface MCPManifest {
  version: number
  updated_at: string
  tools: MCPManifestEntry[]
}

// 运行时状态（非持久化）
export interface EnabledToolEntry {
  // 标识
  goharnessName: string   // "mcp:filesystem:read_file" — 在 goharness 中的工具名
  mcpName: string         // "read_file" — MCP 协议原始工具名
  server: string          // 所属 Server

  // 元数据
  description: string
  inputSchema: Record<string, any>

  // 选择状态
  enabled: boolean        // 当前勾选状态
  isNew: boolean          // 是否由本次 Discover 新增（用于 [new] 标记）
}
