# Subagent System

The subagent system allows a parent agent to spawn isolated child agents that run tasks in parallel and report results back automatically.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Parent Agent (runner.ts)                     │
│                                                                     │
│  tools: sessions_spawn, sessions_list                               │
│  state: resolvedProvider, toolsOptions                              │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           │ sessions_spawn(task, label, timeoutSeconds)
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Spawn Flow (sessions-spawn.ts)                    │
│                                                                     │
│  1. Build subagent system prompt (announce.ts)                      │
│  2. hub.createSubagent(childSessionId, { provider, model })         │
│  3. registerSubagentRun({ start: () => childAgent.write(task) })    │
│  4. Return { status: "accepted", runId, childSessionId }            │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Concurrency Queue (command-queue.ts)                │
│                                                                     │
│  Lane: "subagent" — max 10 concurrent (configurable)                │
│  Queued runs wait for a slot before start() is called               │
└──────────┬──────────────────────────────────────────────────────────┘
           │ slot acquired
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Child Agent Execution                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ AsyncAgent (async-agent.ts)                                   │  │
│  │  - Isolated session with restricted tools (isSubagent=true)   │  │
│  │  - Inherits parent's LLM provider                             │  │
│  │  - System prompt: task focus + error reporting rules           │  │
│  │  - Tracks lastRunError for error propagation                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ watchChildAgent (registry.ts)                                 │  │
│  │  - Sets startedAt, starts timeout timer                       │  │
│  │  - waitForIdle() — waits for child's task queue to drain      │  │
│  │  - onClose() — handles explicit close (timeout kill, etc.)    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           │ child completes / errors / times out
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Completion Handling (registry.ts)                       │
│                                                                     │
│  handleRunCompletion(record)                                        │
│    │                                                                │
│    ├─ Phase 1: captureFindings()                                    │
│    │   - Read last assistant reply from child session JSONL         │
│    │   - Falls back to last toolResult if no assistant text         │
│    │   - Persists findings to record before session deletion        │
│    │                                                                │
│    ├─ Session Cleanup                                               │
│    │   - cleanup="delete": rm child session dir + hub.closeAgent()  │
│    │   - cleanup="keep": preserve for audit                         │
│    │                                                                │
│    └─ Phase 2: checkAndAnnounce(requesterSessionId)                 │
│        - Finds all unannounced, completed runs with findings        │
│        - Calls runCoalescedAnnounceFlow()                           │
│        - Marks records: announced=true, archiveAtMs=now+60min       │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Announcement Delivery (announce.ts)                      │
│                                                                     │
│  runCoalescedAnnounceFlow(requesterSessionId, records)              │
│    │                                                                │
│    ├─ Format message: formatCoalescedAnnouncementMessage()          │
│    │   - Single record: task name, status, findings, stats          │
│    │   - Multiple records: combined report with all findings        │
│    │                                                                │
│    ├─ Two-tier delivery:                                            │
│    │                                                                │
│    │   Tier 1: BUSY (parent running or has pending writes)          │
│    │   └─ enqueueAnnounce() → announce-queue.ts                    │
│    │      - Debounce 1s to batch nearby completions                 │
│    │      - Drain via writeInternal() when parent finishes          │
│    │                                                                │
│    │   Tier 2: IDLE (parent not running)                            │
│    │   └─ sendAnnounceDirect()                                      │
│    │      - writeInternal(msg, { forwardAssistant, persistResponse })│
│    │                                                                │
│    └─ All delivery uses writeInternal() (marks as internal: true)   │
│       → Prevents announcement from showing as user bubble in UI     │
│       → LLM processes findings and responds naturally to user       │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Record Lifecycle (registry.ts)                         │
│                                                                     │
│  created → startedAt → endedAt → findingsCaptured → announced       │
│                                                                     │
│  After announcement:                                                │
│    - Record kept with archiveAtMs = now + 60 min                    │
│    - sessions_list can still query records during this window       │
│    - Sweeper runs every 60s, removes expired records                │
│    - When all records removed, sweeper stops                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `sessions-spawn.ts` | Tool: spawns a child agent with task, label, timeout, provider |
| `sessions-list.ts` | Tool: lists subagent runs and their status |
| `registry.ts` | Lifecycle management: register, watch, capture, announce, archive |
| `announce.ts` | System prompt builder, findings reader, message formatter, delivery |
| `announce-queue.ts` | Debounced queue for batching announcements when parent is busy |
| `command-queue.ts` | Concurrency limiter for subagent lane slots |
| `lanes.ts` | Lane config: max concurrency (10), default timeout (1800s) |
| `types.ts` | Shared types: SubagentRunRecord, SubagentRunOutcome, etc. |
| `registry-store.ts` | Persistence: save/load runs to disk for crash recovery |

## Provider Inheritance

Subagents inherit the parent's resolved LLM provider:

```
runner.ts (resolvedProvider)
  → toolsOptions.provider
    → tools.ts (CreateToolsOptions.provider)
      → sessions-spawn.ts (options.provider)
        → hub.createSubagent({ provider })
```

When the user switches providers via UI (`setProvider()`), `toolsOptions.provider` is updated in sync so future spawns use the new provider.

## Error Propagation

```
Child tool error (e.g., API 401)
  → Subagent LLM sees error, includes in final message (system prompt rule)
    → captureFindings() reads final message
      → Announcement includes error in findings
        → Parent LLM sees error and can inform user

Child run error (e.g., missing API key for provider)
  → AsyncAgent._lastRunError set
    → registry.ts checks childAgent.lastRunError after waitForIdle()
      → outcome = { status: "error", error: "No API key configured..." }
        → Announcement: "task failed: No API key configured..."
```

## Timeout Behavior

Default: 1800s (30 min). System prompt guides the parent LLM:
- Simple tasks: 1800s (default)
- Moderate tasks: 1800-2400s (30-40 min)
- Complex tasks: 2400-3600s (40-60 min)

On timeout:
1. Timeout timer fires in `watchChildAgent()`
2. `cleanup({ status: "timeout" })` is called
3. Child agent is closed via `hub.closeAgent()`
4. Findings are captured from whatever the child wrote so far
5. Announcement reports "timed out" with partial findings
