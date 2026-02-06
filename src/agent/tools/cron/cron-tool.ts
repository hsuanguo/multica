/**
 * Cron Tool for Agent
 *
 * Allows agents to create, manage, and execute scheduled tasks.
 * Based on OpenClaw's implementation (MIT License)
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  getCronService,
  formatSchedule,
  formatDuration,
  parseTimeInput,
  parseIntervalInput,
  isValidCronExpr,
  type CronSchedule,
  type CronJobInput,
} from "../../../cron/index.js";

// NOTE: Avoid Type.Union([Type.Literal(...)]) which compiles to anyOf.
// Some providers reject anyOf in tool schemas; a flat string enum is safer.
function stringEnum<T extends readonly string[]>(values: T, options: { description?: string } = {}) {
  return Type.Unsafe<T[number]>({ type: "string", enum: [...values], ...options });
}

const CRON_ACTIONS = ["status", "list", "add", "update", "remove", "run", "logs"] as const;

// Flattened schema: runtime validates per-action requirements.
const CronSchema = Type.Object({
  action: stringEnum(CRON_ACTIONS),
  enabled: Type.Optional(Type.Boolean({ description: "Filter by enabled status (for list action)" })),
  name: Type.Optional(Type.String({ description: "Job name (for add action)" })),
  description: Type.Optional(Type.String({ description: "Job description (for add action)" })),
  schedule: Type.Optional(Type.Object({
    kind: stringEnum(["at", "every", "cron"] as const),
    at: Type.Optional(Type.String({ description: "Time for one-shot (ISO 8601 or relative like '10m')" })),
    every: Type.Optional(Type.String({ description: "Interval (e.g., '30m', '2h')" })),
    expr: Type.Optional(Type.String({ description: "Cron expression (5-field)" })),
    tz: Type.Optional(Type.String({ description: "Timezone for cron expression" })),
  })),
  sessionTarget: stringEnum(["main", "isolated"] as const, { description: "Where to run: main session or isolated" }),
  payload: Type.Optional(Type.Object({
    kind: stringEnum(["system-event", "agent-turn"] as const),
    text: Type.Optional(Type.String({ description: "Text for system-event" })),
    message: Type.Optional(Type.String({ description: "Prompt for agent-turn" })),
    timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout for agent-turn" })),
  })),
  deleteAfterRun: Type.Optional(Type.Boolean({ description: "Delete after one-time run" })),
  wakeMode: stringEnum(["next-heartbeat", "now"] as const, { description: "When to wake after job execution" }),
  jobId: Type.Optional(Type.String({ description: "Job ID (for update/remove/run/logs actions)" })),
  force: Type.Optional(Type.Boolean({ description: "Force run even if disabled (for run action)" })),
  limit: Type.Optional(Type.Number({ description: "Number of log entries to return (for logs action)" })),
});

type CronArgs = {
  action: "status" | "list" | "add" | "update" | "remove" | "run" | "logs";
  enabled?: boolean;
  name?: string;
  description?: string;
  schedule?: {
    kind: "at" | "every" | "cron";
    at?: string;
    every?: string;
    expr?: string;
    tz?: string;
  };
  sessionTarget?: "main" | "isolated";
  payload?: {
    kind: "system-event" | "agent-turn";
    text?: string;
    message?: string;
    timeoutSeconds?: number;
  };
  deleteAfterRun?: boolean;
  wakeMode?: "next-heartbeat" | "now";
  jobId?: string;
  force?: boolean;
  limit?: number;
};

export type CronResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

/** Parse schedule from tool parameters */
function parseSchedule(schedule: CronArgs["schedule"]): CronSchedule | { error: string } {
  if (!schedule) {
    return { error: "schedule is required" };
  }

  switch (schedule.kind) {
    case "at": {
      const at = schedule.at;
      if (!at) {
        return { error: "schedule.at is required for kind='at'" };
      }
      const atMs = parseTimeInput(at);
      if (!atMs) {
        return { error: `Invalid time format: ${at}` };
      }
      return { kind: "at", atMs };
    }

    case "every": {
      const every = schedule.every;
      if (!every) {
        return { error: "schedule.every is required for kind='every'" };
      }
      const everyMs = parseIntervalInput(every);
      if (!everyMs) {
        return { error: `Invalid interval format: ${every}` };
      }
      return { kind: "every", everyMs };
    }

    case "cron": {
      const expr = schedule.expr;
      if (!expr) {
        return { error: "schedule.expr is required for kind='cron'" };
      }
      const tz = schedule.tz;
      if (!isValidCronExpr(expr, tz)) {
        return { error: `Invalid cron expression: ${expr}` };
      }
      // Only include tz if defined (exactOptionalPropertyTypes)
      if (tz) {
        return { kind: "cron", expr, tz };
      }
      return { kind: "cron", expr };
    }

    default:
      return { error: `Unknown schedule kind: ${schedule.kind}` };
  }
}

const TOOL_DESCRIPTION = `Manage cron jobs (status/list/add/update/remove/run/logs).

ACTIONS:
- status: Check cron scheduler status
- list: List jobs (use enabled:true/false to filter)
- add: Create job (requires name, schedule, payload, sessionTarget)
- update: Modify job (requires jobId, plus fields to update)
- remove: Delete job (requires jobId)
- run: Trigger job immediately (requires jobId, optional force:true)
- logs: Get job run history (requires jobId, optional limit)

SCHEDULE TYPES (schedule.kind):
- "at": One-shot at time
  { "kind": "at", "at": "10m" } or { "kind": "at", "at": "2024-12-31T23:59:00Z" }
- "every": Recurring interval
  { "kind": "every", "every": "30m" }
- "cron": Cron expression
  { "kind": "cron", "expr": "0 9 * * *", "tz": "Asia/Shanghai" }

PAYLOAD TYPES (payload.kind):
- "system-event": Injects text into main session (like a reminder, triggers main agent to respond)
  { "kind": "system-event", "text": "<message>" }
- "agent-turn": Spawns an isolated agent that can use ALL tools (exec, write, web_fetch, etc.) to autonomously complete a task
  { "kind": "agent-turn", "message": "<prompt>", "timeoutSeconds": 300 }

USE "agent-turn" when the job needs to perform actions (run commands, write files, fetch data, etc.).
USE "system-event" when the job only needs to remind/notify the user in the current chat.

CRITICAL CONSTRAINTS:
- sessionTarget="main" REQUIRES payload.kind="system-event"
- sessionTarget="isolated" REQUIRES payload.kind="agent-turn"
- Default sessionTarget is "main", default wakeMode is "now"`;

/** Create the cron tool */
export function createCronTool(): AgentTool<typeof CronSchema, CronResult> {
  return {
    name: "cron",
    label: "Cron",
    description: TOOL_DESCRIPTION,
    parameters: CronSchema,
    execute: async (_toolCallId, args) => {
      const { action } = args as CronArgs;
      const service = getCronService();

      try {
        switch (action) {
          case "status": {
            const status = service.status();
            const output = JSON.stringify({
              running: status.running,
              enabled: status.enabled,
              jobCount: status.jobCount,
              enabledJobCount: status.enabledJobCount,
              nextWakeAt: status.nextWakeAtMs ? new Date(status.nextWakeAtMs).toISOString() : null,
              storePath: status.storePath,
            }, null, 2);
            return {
              content: [{ type: "text", text: output }],
              details: { success: true, message: "Status retrieved", data: status },
            };
          }

          case "list": {
            const params = args as CronArgs;
            const filter = params.enabled !== undefined ? { enabled: params.enabled } : undefined;
            const jobs = service.list(filter);
            const formatted = jobs.map((job) => ({
              id: job.id,
              name: job.name,
              enabled: job.enabled,
              schedule: formatSchedule(job.schedule),
              sessionTarget: job.sessionTarget,
              nextRunAt: job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null,
              lastStatus: job.state.lastStatus,
              lastRunAt: job.state.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
            }));
            const output = JSON.stringify(formatted, null, 2);
            return {
              content: [{ type: "text", text: output }],
              details: { success: true, message: `Found ${jobs.length} job(s)`, data: formatted },
            };
          }

          case "add": {
            const params = args as CronArgs;
            if (!params.name) {
              return {
                content: [{ type: "text", text: "Error: name is required" }],
                details: { success: false, message: "name is required" },
              };
            }

            const schedule = parseSchedule(params.schedule);
            if ("error" in schedule) {
              return {
                content: [{ type: "text", text: `Error: ${schedule.error}` }],
                details: { success: false, message: schedule.error },
              };
            }

            if (!params.payload) {
              return {
                content: [{ type: "text", text: "Error: payload is required" }],
                details: { success: false, message: "payload is required" },
              };
            }

            const { payload } = params;
            let jobPayload;
            if (payload.kind === "system-event") {
              if (!payload.text) {
                return {
                  content: [{ type: "text", text: "Error: payload.text is required for system-event" }],
                  details: { success: false, message: "payload.text is required for system-event" },
                };
              }
              jobPayload = { kind: "system-event" as const, text: payload.text };
            } else if (payload.kind === "agent-turn") {
              if (!payload.message) {
                return {
                  content: [{ type: "text", text: "Error: payload.message is required for agent-turn" }],
                  details: { success: false, message: "payload.message is required for agent-turn" },
                };
              }
              const agentPayload: { kind: "agent-turn"; message: string; timeoutSeconds?: number } = {
                kind: "agent-turn",
                message: payload.message,
              };
              if (payload.timeoutSeconds !== undefined) {
                agentPayload.timeoutSeconds = payload.timeoutSeconds;
              }
              jobPayload = agentPayload;
            } else {
              return {
                content: [{ type: "text", text: `Error: Unknown payload kind` }],
                details: { success: false, message: "Unknown payload kind" },
              };
            }

            const input: CronJobInput = {
              name: params.name,
              enabled: true,
              schedule,
              sessionTarget: params.sessionTarget ?? "main",
              wakeMode: params.wakeMode ?? "now",
              payload: jobPayload,
            };
            if (params.description !== undefined) {
              input.description = params.description;
            }
            if (params.deleteAfterRun !== undefined) {
              input.deleteAfterRun = params.deleteAfterRun;
            }

            const job = service.add(input);
            const output = `Created job: ${job.name} (${job.id})\nSchedule: ${formatSchedule(job.schedule)}\nNext run: ${job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : "none"}`;
            return {
              content: [{ type: "text", text: output }],
              details: { success: true, message: "Job created", data: job },
            };
          }

          case "update": {
            const params = args as CronArgs;
            if (!params.jobId) {
              return {
                content: [{ type: "text", text: "Error: jobId is required" }],
                details: { success: false, message: "jobId is required" },
              };
            }

            const patch: Record<string, unknown> = {};
            if (params.name !== undefined) patch.name = params.name;
            if (params.description !== undefined) patch.description = params.description;
            if (params.enabled !== undefined) patch.enabled = params.enabled;
            if (params.schedule !== undefined) {
              const schedule = parseSchedule(params.schedule);
              if ("error" in schedule) {
                return {
                  content: [{ type: "text", text: `Error: ${schedule.error}` }],
                  details: { success: false, message: schedule.error },
                };
              }
              patch.schedule = schedule;
            }

            const updated = service.update(params.jobId, patch);
            if (!updated) {
              return {
                content: [{ type: "text", text: `Error: Job not found: ${params.jobId}` }],
                details: { success: false, message: "Job not found" },
              };
            }
            return {
              content: [{ type: "text", text: `Updated job: ${updated.name} (${updated.id})` }],
              details: { success: true, message: "Job updated", data: updated },
            };
          }

          case "remove": {
            const params = args as CronArgs;
            if (!params.jobId) {
              return {
                content: [{ type: "text", text: "Error: jobId is required" }],
                details: { success: false, message: "jobId is required" },
              };
            }

            const removed = service.remove(params.jobId);
            if (!removed) {
              return {
                content: [{ type: "text", text: `Error: Job not found: ${params.jobId}` }],
                details: { success: false, message: "Job not found" },
              };
            }
            return {
              content: [{ type: "text", text: `Removed job: ${params.jobId}` }],
              details: { success: true, message: "Job removed" },
            };
          }

          case "run": {
            const params = args as CronArgs;
            if (!params.jobId) {
              return {
                content: [{ type: "text", text: "Error: jobId is required" }],
                details: { success: false, message: "jobId is required" },
              };
            }

            const result = await service.run(params.jobId, params.force);
            if (!result.ok) {
              return {
                content: [{ type: "text", text: `Error: ${result.reason}` }],
                details: { success: false, message: result.reason ?? "Run failed" },
              };
            }
            return {
              content: [{ type: "text", text: "Job executed successfully" }],
              details: { success: true, message: "Job executed" },
            };
          }

          case "logs": {
            const params = args as CronArgs;
            if (!params.jobId) {
              return {
                content: [{ type: "text", text: "Error: jobId is required" }],
                details: { success: false, message: "jobId is required" },
              };
            }

            const logs = service.getRunLogs(params.jobId, params.limit);
            const formatted = logs.map((log) => ({
              timestamp: new Date(log.ts).toISOString(),
              status: log.status,
              duration: log.durationMs ? formatDuration(log.durationMs) : undefined,
              error: log.error,
              summary: log.summary,
            }));
            const output = JSON.stringify(formatted, null, 2);
            return {
              content: [{ type: "text", text: output }],
              details: { success: true, message: `Found ${logs.length} log entries`, data: formatted },
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Error: Unknown action: ${action}` }],
              details: { success: false, message: `Unknown action: ${action}` },
            };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { success: false, message },
        };
      }
    },
  };
}
