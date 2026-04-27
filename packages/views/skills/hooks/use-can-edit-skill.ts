"use client";

import { useQuery } from "@tanstack/react-query";
import type { MemberRole, Skill } from "@multica/core/types";
import { useAuthStore } from "@multica/core/auth";
import { memberListOptions } from "@multica/core/workspace/queries";

/**
 * Whether the current user may edit/delete the given skill.
 *
 * Rule: workspace admins & owners can edit any skill; everyone else can only
 * edit skills they created. Server enforces this independently; the hook
 * mirrors it so the UI can hide/disable actions instead of waiting for a 403.
 *
 * `wsId` is explicit (not read from `WorkspaceIdProvider`) so this hook stays
 * usable in components that render before workspace context is wired, and so
 * the scope of the permission check is always obvious to the caller. Matches
 * the repo rule for workspace-aware hooks.
 */
export function useCanEditSkill(
  skill: Skill | null | undefined,
  wsId: string,
): boolean {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  if (!skill) return false;
  const myRole = members.find((m) => m.user_id === userId)?.role ?? null;
  return canEditSkillContent(skill, { userId, role: myRole });
}

/**
 * Non-hook variant for places that already have the role + userId at hand
 * (e.g. list rows that compute role once for the whole page).
 */
/** Admin/owner or skill creator — matches server `canManageSkill` (without HTTP). */
export function canManageWorkspaceSkill(
  skill: Skill,
  opts: { userId: string | null; role: MemberRole | null },
): boolean {
  if (opts.role === "admin" || opts.role === "owner") return true;
  return skill.created_by === opts.userId;
}

/** Whether the user may change skill body/files (repo-synced skills are read-only until detached). */
export function canEditSkillContent(
  skill: Skill,
  opts: { userId: string | null; role: MemberRole | null },
): boolean {
  if (skill.source === "repo") return false;
  return canManageWorkspaceSkill(skill, opts);
}

/** @deprecated Use `canEditSkillContent` — kept as alias for call sites that mean "edit body". */
export function canEditSkill(
  skill: Skill,
  opts: { userId: string | null; role: MemberRole | null },
): boolean {
  return canEditSkillContent(skill, opts);
}
