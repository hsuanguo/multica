/** Named lanes for the subagent command queue. */
export const SubagentLane = {
  Subagent: "subagent",
} as const;

/** Default maximum concurrent subagent runs. */
export const DEFAULT_SUBAGENT_MAX_CONCURRENT = 10;

// ---------------------------------------------------------------------------
// Timeout defaults
// ---------------------------------------------------------------------------

/** Default subagent timeout: 30 minutes. */
export const DEFAULT_SUBAGENT_TIMEOUT_SECONDS = 1800;

/** Maximum safe value for setTimeout (~24.8 days). */
const MAX_SAFE_TIMEOUT_MS = 2_147_000_000;

/**
 * Resolve the effective timeout in milliseconds for a subagent run.
 *
 * - `undefined` / negative → default (1800 s)
 * - `0`                    → no timeout (MAX_SAFE_TIMEOUT_MS)
 * - positive number        → use as-is, clamped to safe range
 */
export function resolveSubagentTimeoutMs(overrideSeconds?: number): number {
  if (overrideSeconds === undefined || overrideSeconds === null) {
    return DEFAULT_SUBAGENT_TIMEOUT_SECONDS * 1000;
  }
  if (overrideSeconds === 0) {
    return MAX_SAFE_TIMEOUT_MS; // "no timeout"
  }
  if (overrideSeconds < 0) {
    return DEFAULT_SUBAGENT_TIMEOUT_SECONDS * 1000;
  }
  return Math.min(Math.floor(overrideSeconds) * 1000, MAX_SAFE_TIMEOUT_MS);
}
