"use client";

import { useState, useEffect, useCallback } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import {
  Sparkles,
  Plus,
  Trash2,
  Save,
  FileText,
  FolderOpen,
  AlertCircle,
  X,
  Download,
} from "lucide-react";
import type { Skill, CreateSkillRequest, UpdateSkillRequest } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/shared/api";
import { useAuthStore } from "@/features/auth";
import { useWorkspaceStore } from "@/features/workspace";
import { useWSEvent } from "@/features/realtime";

// ---------------------------------------------------------------------------
// Create Skill Dialog
// ---------------------------------------------------------------------------

function CreateSkillDialog({
  onClose,
  onCreate,
  onImport,
}: {
  onClose: () => void;
  onCreate: (data: CreateSkillRequest) => Promise<void>;
  onImport: (url: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"create" | "import">("create");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState("");

  const detectedSource = (() => {
    const url = importUrl.trim().toLowerCase();
    if (url.includes("clawhub.ai")) return "clawhub" as const;
    if (url.includes("skills.sh")) return "skills.sh" as const;
    return null;
  })();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim() });
      onClose();
    } catch {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setLoading(true);
    setImportError("");
    try {
      await onImport(importUrl.trim());
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Skill</DialogTitle>
          <DialogDescription>
            Create a new skill or import from ClawHub / Skills.sh.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "create" | "import")}>
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">
              <Plus className="mr-1.5 h-3 w-3" />
              Create
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              <Download className="mr-1.5 h-3 w-3" />
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 mt-4">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Code Review, Bug Triage"
                className="mt-1"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this skill does"
                className="mt-1"
              />
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            <div>
              <Label className="text-xs text-muted-foreground">Skill URL</Label>
              <Input
                autoFocus
                type="text"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setImportError(""); }}
                placeholder="https://clawhub.ai/owner/skill-name"
                className="mt-1"
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
              <div className="flex items-center gap-2 mt-1.5">
                {detectedSource ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
                    {detectedSource === "clawhub" ? "ClawHub" : "Skills.sh"}
                  </span>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Supports <span className="font-medium">clawhub.ai</span> and <span className="font-medium">skills.sh</span>
                  </p>
                )}
              </div>
            </div>
            {importError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {importError}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {tab === "create" ? (
            <Button onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create"}
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={loading || !importUrl.trim()}>
              <Download className="mr-1.5 h-3 w-3" />
              {loading ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Skill List Item
// ---------------------------------------------------------------------------

function SkillListItem({
  skill,
  isSelected,
  onClick,
}: {
  skill: Skill;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{skill.name}</div>
        {skill.description && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {skill.description}
          </div>
        )}
      </div>
      {(skill.files?.length ?? 0) > 0 && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {skill.files.length} file{skill.files.length !== 1 ? "s" : ""}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// File Editor
// ---------------------------------------------------------------------------

function FileEditor({
  files,
  onFilesChange,
}: {
  files: { path: string; content: string }[];
  onFilesChange: (files: { path: string; content: string }[]) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addFile = () => {
    onFilesChange([...files, { path: "", content: "" }]);
    setEditingIndex(files.length);
  };

  const updateFile = (index: number, field: "path" | "content", value: string) => {
    const updated = files.map((f, i) =>
      i === index ? { ...f, [field]: value } : f,
    );
    onFilesChange(updated);
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Supporting Files</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Templates, scripts, or reference files available to the agent.
          </p>
        </div>
        <Button variant="outline" size="xs" onClick={addFile}>
          <Plus className="h-3 w-3" />
          Add File
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
          <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No supporting files</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div key={index} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="text"
                  value={file.path}
                  onChange={(e) => updateFile(index, "path", e.target.value)}
                  placeholder="path/to/file.md"
                  className="h-7 border-0 p-0 text-xs font-mono shadow-none focus-visible:ring-0"
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setEditingIndex(editingIndex === index ? null : index)
                  }
                  className="shrink-0 text-muted-foreground"
                >
                  <FileText className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeFile(index)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {editingIndex === index && (
                <Textarea
                  value={file.content}
                  onChange={(e) => updateFile(index, "content", e.target.value)}
                  placeholder="File content..."
                  className="min-h-32 resize-none rounded-none rounded-b-lg border-0 font-mono text-xs"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Detail
// ---------------------------------------------------------------------------

function SkillDetail({
  skill,
  onUpdate,
  onDelete,
}: {
  skill: Skill;
  onUpdate: (id: string, data: UpdateSkillRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [content, setContent] = useState(skill.content);
  const [files, setFiles] = useState<{ path: string; content: string }[]>(
    (skill.files ?? []).map((f) => ({ path: f.path, content: f.content })),
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync basic fields from store updates
  useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setContent(skill.content);
  }, [skill.id, skill.name, skill.description, skill.content]);

  // Fetch full skill (with files) on selection change
  useEffect(() => {
    api.getSkill(skill.id).then((full) => {
      useWorkspaceStore.getState().upsertSkill(full);
      setFiles((full.files ?? []).map((f) => ({ path: f.path, content: f.content })));
    });
  }, [skill.id]);

  const isDirty =
    name !== skill.name ||
    description !== skill.description ||
    content !== skill.content ||
    JSON.stringify(files) !==
      JSON.stringify((skill.files ?? []).map((f) => ({ path: f.path, content: f.content })));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(skill.id, {
        name: name.trim(),
        description: description.trim(),
        content,
        files: files.filter((f) => f.path.trim()),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{skill.name}</h2>
            {skill.description && (
              <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button onClick={handleSave} disabled={saving || !name.trim()} size="xs">
              <Save className="h-3 w-3" />
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setConfirmDelete(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              className="mt-1"
            />
          </div>
        </div>

        {/* Content Editor */}
        <div>
          <Label className="text-xs text-muted-foreground">
            Content (SKILL.md)
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Main skill instructions in Markdown. This becomes the SKILL.md file in the agent&apos;s execution environment.
          </p>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`# Skill Name\n\nDescribe what this skill does and provide instructions.\n\n## Workflow\n1. Step one\n2. Step two\n\n## Rules\n- Rule one\n- Rule two`}
            className="h-64 resize-none font-mono text-sm leading-relaxed"
          />
        </div>

        {/* Files */}
        <FileEditor files={files} onFilesChange={setFiles} />
      </div>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <Dialog open onOpenChange={(v) => { if (!v) setConfirmDelete(false); }}>
          <DialogContent className="max-w-sm" showCloseButton={false}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <DialogHeader className="flex-1 gap-1">
                <DialogTitle className="text-sm font-semibold">Delete skill?</DialogTitle>
                <DialogDescription className="text-xs">
                  This will permanently delete &quot;{skill.name}&quot; and remove it from all agents.
                </DialogDescription>
              </DialogHeader>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(skill.id);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const skills = useWorkspaceStore((s) => s.skills);
  const refreshSkills = useWorkspaceStore((s) => s.refreshSkills);
  const upsertSkill = useWorkspaceStore((s) => s.upsertSkill);
  const removeSkill = useWorkspaceStore((s) => s.removeSkill);
  const [selectedId, setSelectedId] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "multica_skills_layout",
  });

  useEffect(() => {
    if (skills.length > 0 && !selectedId) {
      setSelectedId(skills[0]!.id);
    }
  }, [skills, selectedId]);

  const handleRefresh = useCallback(() => {
    refreshSkills();
  }, [refreshSkills]);

  useWSEvent("skill:created", handleRefresh);
  useWSEvent("skill:updated", handleRefresh);
  useWSEvent("skill:deleted", handleRefresh);

  const handleCreate = async (data: CreateSkillRequest) => {
    const skill = await api.createSkill(data);
    upsertSkill(skill);
    setSelectedId(skill.id);
  };

  const handleImport = async (url: string) => {
    const skill = await api.importSkill({ url });
    upsertSkill(skill);
    setSelectedId(skill.id);
  };

  const handleUpdate = async (id: string, data: UpdateSkillRequest) => {
    const updated = await api.updateSkill(id, data);
    upsertSkill(updated);
  };

  const handleDelete = async (id: string) => {
    await api.deleteSkill(id);
    if (selectedId === id) {
      const remaining = skills.filter((s) => s.id !== id);
      setSelectedId(remaining[0]?.id ?? "");
    }
    removeSkill(id);
  };

  const selected = skills.find((s) => s.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="flex-1 min-h-0"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="list" defaultSize={280} minSize={240} maxSize={400} groupResizeBehavior="preserve-pixel-size">
        {/* Left column — skill list */}
        <div className="overflow-y-auto h-full border-r">
          <div className="flex h-12 items-center justify-between border-b px-4">
            <h1 className="text-sm font-semibold">Skills</h1>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          {skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12">
              <Sparkles className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No skills yet</p>
              <p className="mt-1 text-xs text-muted-foreground text-center">
                Skills define reusable instructions for agents.
              </p>
              <Button
                onClick={() => setShowCreate(true)}
                size="xs"
                className="mt-3"
              >
                <Plus className="h-3 w-3" />
                Create Skill
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {skills.map((skill) => (
                <SkillListItem
                  key={skill.id}
                  skill={skill}
                  isSelected={skill.id === selectedId}
                  onClick={() => setSelectedId(skill.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id="detail" minSize="50%">
        {/* Right column — skill detail */}
        <div className="flex-1 overflow-hidden h-full">
          {selected ? (
            <SkillDetail
              key={selected.id}
              skill={selected}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Sparkles className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm">Select a skill to view details</p>
              <Button
                onClick={() => setShowCreate(true)}
                size="xs"
                className="mt-3"
              >
                <Plus className="h-3 w-3" />
                Create Skill
              </Button>
            </div>
          )}
        </div>
      </ResizablePanel>

      {showCreate && (
        <CreateSkillDialog
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          onImport={handleImport}
        />
      )}
    </ResizablePanelGroup>
  );
}
