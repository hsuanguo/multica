"use client"

import { useEffect } from "react"
import { useHubStore } from "./hub"
import { useDeviceId } from "./device-id"
import { useGatewayStore } from "./gateway"
import { loadConnection } from "./connection"

export function useHubInit() {
  const deviceId = useDeviceId()
  const gwState = useGatewayStore((s) => s.connectionState)
  const hubId = useGatewayStore((s) => s.hubId)
  const agentId = useGatewayStore((s) => s.agentId)
  const reset = useHubStore((s) => s.reset)
  const fetchHub = useHubStore((s) => s.fetchHub)
  const fetchAgents = useHubStore((s) => s.fetchAgents)
  const setActiveAgentId = useHubStore((s) => s.setActiveAgentId)

  // Auto-connect from saved connection code
  useEffect(() => {
    if (!deviceId) return
    const saved = loadConnection()
    if (saved) {
      useGatewayStore.getState().connectWithCode(saved, deviceId)
    }
    return () => { useGatewayStore.getState().disconnect() }
  }, [deviceId])

  // Once registered with a hub, fetch hub info and agents, set active agent
  useEffect(() => {
    if (gwState === "registered" && hubId) {
      fetchHub()
      fetchAgents()
      if (agentId) {
        setActiveAgentId(agentId)
      }
    }
    if (gwState === "disconnected") {
      reset()
    }
  }, [gwState, hubId, agentId, reset, fetchHub, fetchAgents, setActiveAgentId])
}
