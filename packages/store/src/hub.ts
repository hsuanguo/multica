import { create } from "zustand"
import { toast } from "sonner"
import { v7 as uuidv7 } from "uuid"
import type {
  GetHubInfoResult,
  ListAgentsResult,
  CreateAgentResult,
  DeleteAgentResult,
  GetAgentMessagesResult,
  AgentMessageItem,
} from "@multica/sdk"
import { useGatewayStore } from "./gateway"
import { useMessagesStore } from "./messages"

/** Extract plain text from agent message content (string or content block array) */
function extractText(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n")
}

export type HubInfo = GetHubInfoResult

export interface Agent {
  id: string
  closed: boolean
}

export type HubStatus = "idle" | "loading" | "connected" | "error"

interface HubState {
  status: HubStatus
  hub: HubInfo | null
  agents: Agent[]
  activeAgentId: string | null
}

interface HubActions {
  reset: () => void
  setActiveAgentId: (id: string | null) => void
  fetchHub: () => Promise<void>
  fetchAgents: () => Promise<void>
  fetchAgentMessages: (agentId: string) => Promise<void>
  createAgent: (options?: Record<string, unknown>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

export type HubStore = HubState & HubActions

export const useHubStore = create<HubStore>()((set, get) => ({
  status: "idle",
  hub: null,
  agents: [],
  activeAgentId: null,

  reset: () => set({ status: "idle", hub: null, agents: [], activeAgentId: null }),

  setActiveAgentId: (id) => {
    set({ activeAgentId: id })
    if (id) {
      // Load history if no messages exist for this agent yet
      const existing = useMessagesStore.getState().messages.filter((m) => m.agentId === id)
      if (existing.length === 0) {
        get().fetchAgentMessages(id)
      }
    }
  },

  fetchHub: async () => {
    set({ status: "loading" })
    try {
      const { request } = useGatewayStore.getState()
      const data = await request<GetHubInfoResult>("getHubInfo")
      set({ hub: data, status: "connected" })
    } catch {
      set({ status: "error", hub: null })
    }
  },

  fetchAgents: async () => {
    try {
      const { request } = useGatewayStore.getState()
      const data = await request<ListAgentsResult>("listAgents")
      set({ agents: data.agents })
    } catch (e) {
      toast.error("Failed to fetch agents")
      console.error(e)
    }
  },

  fetchAgentMessages: async (agentId) => {
    try {
      const { request } = useGatewayStore.getState()
      const data = await request<GetAgentMessagesResult>("getAgentMessages", { agentId })
      const msgs = data.messages
        .filter((m): m is AgentMessageItem & { role: "user" | "assistant" } =>
          m.role === "user" || m.role === "assistant"
        )
        .map((m) => ({
          id: uuidv7(),
          role: m.role,
          content: extractText(m.content),
          agentId,
        }))
        .filter((m) => m.content.length > 0)
      useMessagesStore.getState().loadMessages(agentId, msgs)
    } catch (e) {
      console.error("Failed to fetch agent messages:", e)
    }
  },

  createAgent: async (options?) => {
    try {
      const { request } = useGatewayStore.getState()
      const data = await request<CreateAgentResult>("createAgent", options)
      await get().fetchAgents()
      if (data.id) set({ activeAgentId: data.id })
    } catch (e) {
      toast.error("Failed to create agent")
      console.error(e)
    }
  },

  deleteAgent: async (id) => {
    if (get().activeAgentId === id) set({ activeAgentId: null })
    try {
      const { request } = useGatewayStore.getState()
      await request<DeleteAgentResult>("deleteAgent", { id })
      await get().fetchAgents()
    } catch (e) {
      toast.error("Failed to delete agent")
      console.error(e)
    }
  },
}))
