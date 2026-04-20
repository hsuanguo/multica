// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  RuntimeDevice,
  MemberWithUser,
  Workspace,
  CreateAgentRequest,
} from "@multica/core/types";

// useCurrentWorkspace must be a mock we can swap per test — the dialog reads
// workspace.repos from it to populate (and enable) the Repo picker.
const mockUseCurrentWorkspace = vi.hoisted(() => vi.fn<() => Workspace | null>());

vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => mockUseCurrentWorkspace(),
}));

// ModelDropdown does an internal useQuery; swap it with a minimal stub so the
// test doesn't need a runtime-models mock. Its behavior is tested separately.
vi.mock("../model-dropdown", () => ({
  ModelDropdown: () => null,
}));

// The dialog also renders ProviderLogo + ActorAvatar indirectly via the
// runtime picker. Stubbing keeps the test DOM narrowly focused.
vi.mock("../../runtimes/components/provider-logo", () => ({
  ProviderLogo: () => null,
}));

vi.mock("../../common/actor-avatar", () => ({
  ActorAvatar: () => null,
}));

// sonner's toast() invokes side effects; stub just the error path used here.
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { CreateAgentDialog } from "./create-agent-dialog";

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

function workspaceWithRepos(repos: Workspace["repos"]): Workspace {
  return {
    id: "ws-1",
    name: "Workspace",
    slug: "ws",
    description: null,
    context: null,
    settings: {},
    repos,
    issue_prefix: "MUL",
    created_at: "2026-04-16T00:00:00Z",
    updated_at: "2026-04-16T00:00:00Z",
  };
}

function renderDialog(onCreate: (data: CreateAgentRequest) => Promise<void>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateAgentDialog
        runtimes={[runtime]}
        members={members}
        currentUserId="user-1"
        onClose={() => {}}
        onCreate={onCreate}
      />
    </QueryClientProvider>,
  );
}

describe("CreateAgentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to primary and submits without a repo_url", async () => {
    mockUseCurrentWorkspace.mockReturnValue(
      workspaceWithRepos([
        { url: "https://github.com/acme/widgets.git", description: "widgets" },
      ]),
    );
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderDialog(onCreate);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("e.g. Deep Research Agent"), "My Agent");

    const create = screen.getByRole("button", { name: /create/i });
    expect(create).not.toBeDisabled();
    await user.click(create);

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const payload = onCreate.mock.calls[0]![0] as CreateAgentRequest;
    expect(payload.name).toBe("My Agent");
    expect(payload.agent_type).toBe("primary");
    // repo_url must not be sent for primary agents (server-side validation
    // rejects a non-empty repo_url on primary). Undefined is acceptable; a
    // stray empty string is not.
    expect(payload.repo_url).toBeUndefined();
  });

  it("disables Create until a repository is picked for a repo agent, then submits with repo_url", async () => {
    const repoURL = "https://github.com/acme/widgets.git";
    mockUseCurrentWorkspace.mockReturnValue(
      workspaceWithRepos([
        { url: repoURL, description: "widgets" },
        { url: "https://github.com/acme/other.git", description: "other" },
      ]),
    );
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderDialog(onCreate);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("e.g. Deep Research Agent"), "Repo Agent");

    // Flip type selection: click the "Repo" card. We locate it via its
    // distinctive sub-label so we don't collide with the "Repository" label
    // on the repo picker popover.
    const repoTypeButton = screen
      .getByText(/Bound to one repo; cwd = repo root/i)
      .closest("button")!;
    await user.click(repoTypeButton);

    const create = screen.getByRole("button", { name: /create/i });
    // Repo agent with no repo picked yet → Create stays disabled to prevent
    // a 400 round-trip to the server.
    expect(create).toBeDisabled();

    // Open the repo picker and choose the first option.
    await user.click(screen.getByText("Select a repository"));
    await user.click(await screen.findByText(repoURL));

    expect(create).not.toBeDisabled();
    await user.click(create);

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const payload = onCreate.mock.calls[0]![0] as CreateAgentRequest;
    expect(payload.agent_type).toBe("repo");
    expect(payload.repo_url).toBe(repoURL);
  });

  it("shows an empty-state hint when the workspace has no configured repos", async () => {
    mockUseCurrentWorkspace.mockReturnValue(workspaceWithRepos([]));
    renderDialog(vi.fn());

    const user = userEvent.setup();
    const repoTypeButton = screen
      .getByText(/Bound to one repo; cwd = repo root/i)
      .closest("button")!;
    await user.click(repoTypeButton);

    expect(screen.getByText(/No repositories configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Add repos in Workspace settings first/i)).toBeInTheDocument();
  });
});
