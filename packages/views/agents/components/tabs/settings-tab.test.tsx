// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, RuntimeDevice, MemberWithUser } from "@multica/core/types";

// The settings tab pulls API clients for avatar upload + heavy subcomponents.
// We only care about the Type row, so stub the noise.
vi.mock("@multica/core/api", () => ({ api: {} }));
vi.mock("@multica/core/hooks/use-file-upload", () => ({
  useFileUpload: () => ({ upload: vi.fn(), uploading: false }),
}));
vi.mock("../../../common/actor-avatar", () => ({ ActorAvatar: () => null }));
vi.mock("../../../runtimes/components/provider-logo", () => ({
  ProviderLogo: () => null,
}));
vi.mock("../model-dropdown", () => ({ ModelDropdown: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { SettingsTab } from "./settings-tab";

const runtime: RuntimeDevice = {
  id: "runtime-1",
  workspace_id: "ws-1",
  daemon_id: "daemon-1",
  name: "My Runtime",
  runtime_mode: "local",
  provider: "claude",
  launch_header: "claude",
  status: "online",
  device_info: "laptop",
  metadata: {},
  owner_id: "user-1",
  last_seen_at: null,
  created_at: "2026-04-16T00:00:00Z",
  updated_at: "2026-04-16T00:00:00Z",
};

const members: MemberWithUser[] = [];

function baseAgent(overrides: Partial<Agent>): Agent {
  return {
    id: "agent-1",
    workspace_id: "ws-1",
    runtime_id: "runtime-1",
    name: "Agent",
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_env: {},
    custom_args: [],
    custom_env_redacted: false,
    visibility: "workspace",
    status: "idle",
    max_concurrent_tasks: 1,
    model: "",
    owner_id: "user-1",
    skills: [],
    created_at: "2026-04-16T00:00:00Z",
    updated_at: "2026-04-16T00:00:00Z",
    archived_at: null,
    archived_by: null,
    agent_type: "primary",
    repo_url: null,
    ...overrides,
  };
}

function renderSettings(agent: Agent) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsTab
        agent={agent}
        runtimes={[runtime]}
        members={members}
        currentUserId="user-1"
        onSave={vi.fn().mockResolvedValue(undefined)}
      />
    </QueryClientProvider>,
  );
}

describe("SettingsTab (agent type row)", () => {
  it("renders Primary as read-only with the immutability notice", () => {
    renderSettings(baseAgent({ agent_type: "primary", repo_url: null }));

    // Type label row + capitalized "primary" value.
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
    // Primary agents should explain the default workdir behavior.
    expect(
      screen.getByText(/Fresh workdir; agent checks out repos on demand/i),
    ).toBeInTheDocument();
    // The immutability notice must be present so users know to archive+recreate.
    expect(
      screen.getByText(/set at creation and can.+t be changed/i),
    ).toBeInTheDocument();
  });

  it("renders Repo with the bound repo_url and no editable control", () => {
    const repoURL = "https://github.com/acme/widgets.git";
    renderSettings(baseAgent({ agent_type: "repo", repo_url: repoURL }));

    expect(screen.getByText("repo")).toBeInTheDocument();
    expect(screen.getByText(repoURL)).toBeInTheDocument();
    // Primary agents see the "Fresh workdir" copy; repo agents must not.
    expect(
      screen.queryByText(/Fresh workdir; agent checks out repos on demand/i),
    ).not.toBeInTheDocument();
    // Immutability notice still applies.
    expect(
      screen.getByText(/set at creation and can.+t be changed/i),
    ).toBeInTheDocument();
  });
});
