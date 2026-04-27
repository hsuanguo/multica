"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Plus, Trash2, RefreshCw } from "lucide-react";
import { Input } from "@multica/ui/components/ui/input";
import { Button } from "@multica/ui/components/ui/button";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { Label } from "@multica/ui/components/ui/label";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@multica/core/auth";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace } from "@multica/core/paths";
import { memberListOptions, workspaceKeys, skillListOptions } from "@multica/core/workspace/queries";
import { api, ApiError } from "@multica/core/api";
import type { SyncRepoSkillsResponse, Workspace, WorkspaceRepo } from "@multica/core/types";
import { timeAgo } from "@multica/core/utils";

function canonicalGitHubUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("git@github.com:")) {
    const rest = s.slice("git@github.com:".length).replace(/\.git$/i, "");
    const parts = rest.split("/");
    if (parts.length < 2) return null;
    const [o, r] = parts;
    if (!o || !r) return null;
    return `https://github.com/${o.toLowerCase()}/${r.toLowerCase()}`;
  }
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "github.com") return null;
    const parts = u.pathname
      .replace(/^\//, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return null;
    const [o, r] = parts;
    if (!o || !r) return null;
    return `https://github.com/${o.toLowerCase()}/${r.replace(/\.git$/i, "").toLowerCase()}`;
  } catch {
    return null;
  }
}

function latestSyncedLabel(
  skills: { source?: string; source_metadata?: Record<string, unknown>; synced_at?: string | null }[],
  repoUrl: string,
): string | null {
  const want = canonicalGitHubUrl(repoUrl);
  if (!want) return null;
  let best: string | null = null;
  for (const s of skills) {
    if (s.source !== "repo") continue;
    const raw = s.source_metadata?.repo_url;
    const ru = typeof raw === "string" ? canonicalGitHubUrl(raw) : null;
    if (ru === want && s.synced_at) {
      if (!best || s.synced_at > best) best = s.synced_at;
    }
  }
  return best;
}

export function RepositoriesTab() {
  const user = useAuthStore((s) => s.user);
  const workspace = useCurrentWorkspace();
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: skills = [] } = useQuery(skillListOptions(wsId));

  const [repos, setRepos] = useState<WorkspaceRepo[]>(workspace?.repos ?? []);
  const [saving, setSaving] = useState(false);

  const [syncRepo, setSyncRepo] = useState<WorkspaceRepo | null>(null);
  const [preview, setPreview] = useState<SyncRepoSkillsResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null;
  const canManageWorkspace = currentMember?.role === "owner" || currentMember?.role === "admin";

  useEffect(() => {
    setRepos(workspace?.repos ?? []);
  }, [workspace]);

  useEffect(() => {
    if (!syncRepo?.url?.trim()) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    setConfirmOverwrite(false);
    void (async () => {
      try {
        const p = await api.syncRepoSkills({ repo_url: syncRepo.url }, { dryRun: true });
        if (!cancelled) setPreview(p);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to preview skill sync");
          setSyncRepo(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncRepo]);

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, { repos });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success("Repositories saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save repositories");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRepo = () => {
    setRepos([...repos, { url: "", description: "" }]);
  };

  const handleRemoveRepo = (index: number) => {
    setRepos(repos.filter((_, i) => i !== index));
  };

  const handleRepoChange = (index: number, field: keyof WorkspaceRepo, value: string) => {
    setRepos(repos.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const overwrittenManual = preview?.overwritten_manual ?? [];
  const orphanedList = preview?.orphaned ?? [];
  const needsOverwriteConfirm = overwrittenManual.length > 0;

  const runSync = async () => {
    if (!syncRepo?.url?.trim()) return;
    if (needsOverwriteConfirm && !confirmOverwrite) {
      toast.error("Confirm overwriting existing skills with the same name.");
      return;
    }
    setSyncing(true);
    try {
      const result = await api.syncRepoSkills({
        repo_url: syncRepo.url,
        confirm_overwrite_manual: needsOverwriteConfirm ? confirmOverwrite : false,
      });
      const touched =
        (result.created?.length ?? 0) + (result.updated?.length ?? 0);
      if (result.github_notice?.trim()) {
        toast.info(result.github_notice, { duration: 12_000 });
      } else if (touched === 0) {
        toast.warning(
          "Sync completed but no skills were imported. The server may not see any SKILL.md packs under supported paths (.claude/skills, .cursor/skills, skills/, …), or GitHub could not be reached from the deployment.",
          { duration: 10_000 },
        );
      } else {
        toast.success(`Synced ${touched} skill(s) from repository`);
      }
      // Refetch without `exact: true` so all workspace skill queries (list + detail prefixes) refresh reliably.
      await qc.invalidateQueries({ queryKey: workspaceKeys.skills(wsId) });
      await qc.refetchQueries({ queryKey: workspaceKeys.skills(wsId), type: "active" });
      setSyncRepo(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  };

  const syncDialogOpen = syncRepo !== null;

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    const parts: string[] = [];
    const created = preview.created ?? [];
    const updated = preview.updated ?? [];
    const orphaned = preview.orphaned ?? [];
    if (created.length) parts.push(`${created.length} new`);
    if (updated.length) parts.push(`${updated.length} updated`);
    if (orphaned.length) parts.push(`${orphaned.length} not in repo (still in workspace)`);
    if (preview.skipped?.length) parts.push(`${preview.skipped.length} skipped`);
    return parts.length ? parts.join(" · ") : "No changes";
  }, [preview]);

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Repositories</h2>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Git repositories associated with this workspace. Agents use these to clone and work on code.
            </p>

            {repos.map((repo, index) => (
              <div key={index} className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Input
                      type="url"
                      value={repo.url}
                      onChange={(e) => handleRepoChange(index, "url", e.target.value)}
                      disabled={!canManageWorkspace}
                      placeholder="https://git.example.com/org/repo.git"
                      className="text-sm"
                    />
                    <Input
                      type="text"
                      value={repo.description}
                      onChange={(e) => handleRepoChange(index, "description", e.target.value)}
                      disabled={!canManageWorkspace}
                      placeholder="Description (e.g. Go backend + Next.js frontend)"
                      className="text-sm"
                    />
                  </div>
                  {canManageWorkspace && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveRepo(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {repo.url.trim() && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      {(() => {
                        const ts = latestSyncedLabel(skills, repo.url);
                        return ts ? `Last skill sync ${timeAgo(ts)}` : "Skills from this repo not synced yet";
                      })()}
                    </p>
                    {canManageWorkspace && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="shrink-0 gap-1"
                        onClick={() => setSyncRepo(repo)}
                        disabled={!canonicalGitHubUrl(repo.url)}
                        title={
                          canonicalGitHubUrl(repo.url)
                            ? undefined
                            : "Skill sync supports GitHub.com URLs in v1"
                        }
                      >
                        <RefreshCw className="h-3 w-3" />
                        Sync skills
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {canManageWorkspace && (
              <div className="flex items-center justify-between pt-1">
                <Button variant="outline" size="sm" onClick={handleAddRepo}>
                  <Plus className="h-3 w-3" />
                  Add repository
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-3 w-3" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            )}

            {!canManageWorkspace && (
              <p className="text-xs text-muted-foreground">Only admins and owners can manage repositories.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={syncDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSyncRepo(null);
            setPreview(null);
            setConfirmOverwrite(false);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sync skills from repository</DialogTitle>
            <DialogDescription>
              Imports <code className="rounded bg-muted px-1">SKILL.md</code> packs from conventional paths
              (e.g. <code className="rounded bg-muted px-1">.claude/skills</code>) into workspace skills. GitHub only
              in v1.
            </DialogDescription>
          </DialogHeader>

          {syncRepo && (
            <div className="space-y-3 text-sm">
              <div className="break-all font-mono text-xs text-muted-foreground">{syncRepo.url}</div>
              {previewLoading && <p className="text-xs text-muted-foreground">Scanning repository…</p>}
              {!previewLoading && preview && (
                <>
                  {preview.github_notice?.trim() ? (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {preview.github_notice}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{previewSummary}</p>
                  {overwrittenManual.length > 0 && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                      <p className="font-medium text-foreground">Will overwrite existing workspace skills:</p>
                      <ul className="mt-1 list-inside list-disc text-muted-foreground">
                        {overwrittenManual.map((o) => (
                          <li key={o.id || o.name}>
                            {o.name}{" "}
                            <span className="text-muted-foreground/80">
                              (was {o.previous_source})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {orphanedList.length > 0 && (
                    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Orphaned in workspace</span> — these repo-linked
                      skills are no longer under the scanned paths (they are not deleted automatically):
                      <ul className="mt-1 list-inside list-disc">
                        {orphanedList.map((o) => (
                          <li key={o.id || o.name}>{o.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {needsOverwriteConfirm && (
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        id="confirm-overwrite-skills"
                        checked={confirmOverwrite}
                        onCheckedChange={(next) => setConfirmOverwrite(next === true)}
                      />
                      <Label htmlFor="confirm-overwrite-skills" className="text-xs leading-snug font-normal">
                        I understand these skills will be replaced by the repository version.
                      </Label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSyncRepo(null)} disabled={syncing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void runSync()}
              disabled={
                syncing ||
                previewLoading ||
                !preview ||
                (needsOverwriteConfirm && !confirmOverwrite) ||
                !!preview?.github_notice?.trim()
              }
              title={
                preview?.github_notice?.trim()
                  ? "GitHub did not allow anonymous API listing from this server’s network."
                  : undefined
              }
            >
              {syncing ? "Syncing…" : "Run sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
