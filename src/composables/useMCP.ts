import { ref } from 'vue'
import { getMindXClient } from '../services/websocket'
import type { MCPServerConfig, MCPServerListEntry, MCPToolDef, MCPManifest, MCPManifestEntry } from '../types/mcp'

export function useMCP() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  function client() {
    return getMindXClient()
  }

  async function addServer(cfg: MCPServerConfig): Promise<{ ok: boolean }> {
    return client()!.call('mcp.server.add', cfg)
  }

  async function removeServer(name: string): Promise<{ ok: boolean }> {
    return client()!.call('mcp.server.remove', { name })
  }

  async function listServers(): Promise<MCPServerListEntry[]> {
    return client()!.call('mcp.server.list', {})
  }

  async function testConnection(name: string): Promise<{ ok: boolean; error?: string }> {
    return client()!.call('mcp.server.test', { name })
  }

  async function discoverTools(name: string): Promise<MCPToolDef[]> {
    return client()!.call('mcp.server.discover', { name })
  }

  async function saveManifest(tools: MCPManifestEntry[]): Promise<{ ok: boolean; tool_count: number }> {
    return client()!.call('mcp.manifest.save', { tools })
  }

  async function getManifest(): Promise<MCPManifest> {
    return client()!.call('mcp.manifest.get', {})
  }

  return {
    loading,
    error,
    addServer,
    removeServer,
    listServers,
    testConnection,
    discoverTools,
    saveManifest,
    getManifest,
  }
}
