import type { Skill } from "@multica/core/types";

/**
 * Discriminated view over skill provenance: `Skill.source` / `source_metadata`
 * (repo sync, marketplace) plus legacy `Skill.config.origin` for local runtime
 * imports. Manual creates have no origin, so we synthesize `{ type: "manual"
 * }` when neither applies.
 */
export type OriginInfo = {
  type: "runtime_local" | "clawhub" | "skills_sh" | "manual" | "repo";
  provider?: string;
  runtime_id?: string;
  source_path?: string;
  source_url?: string;
  /** When `type === "repo"`, canonical repo URL from `source_metadata`. */
  repo_url?: string;
  branch?: string;
  path?: string;
};

export function readOrigin(skill: Skill): OriginInfo {
  if (skill.source === "repo") {
    const meta = skill.source_metadata ?? {};
    return {
      type: "repo",
      repo_url: typeof meta.repo_url === "string" ? meta.repo_url : undefined,
      branch: typeof meta.branch === "string" ? meta.branch : undefined,
      path: typeof meta.path === "string" ? meta.path : undefined,
    };
  }
  if (skill.source === "clawhub") {
    return { type: "clawhub" };
  }
  if (skill.source === "skills_sh") {
    return { type: "skills_sh" };
  }
  const raw = (skill.config?.origin ?? null) as
    | (OriginInfo & Record<string, unknown>)
    | null;
  if (raw?.type === "runtime_local") return raw;
  if (raw?.type === "clawhub") return raw;
  if (raw?.type === "skills_sh") return raw;
  return { type: "manual" };
}

/** SKILL.md is always present plus any additional attached files. */
export function totalFileCount(skill: Skill): number {
  return (skill.files?.length ?? 0) + 1;
}
