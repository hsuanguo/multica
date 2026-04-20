package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateAgent_RejectsDuplicateName(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	// Clean up any agents created by this test.
	t.Cleanup(func() {
		testPool.Exec(context.Background(),
			`DELETE FROM agent WHERE workspace_id = $1 AND name = $2`,
			testWorkspaceID, "duplicate-name-test-agent",
		)
	})

	body := map[string]any{
		"name":                 "duplicate-name-test-agent",
		"description":          "first description",
		"runtime_id":           testRuntimeID,
		"visibility":           "private",
		"max_concurrent_tasks": 1,
	}

	// First call — creates the agent.
	w1 := httptest.NewRecorder()
	testHandler.CreateAgent(w1, newRequest(http.MethodPost, "/api/agents", body))
	if w1.Code != http.StatusCreated {
		t.Fatalf("first CreateAgent: expected 201, got %d: %s", w1.Code, w1.Body.String())
	}
	var resp1 map[string]any
	if err := json.NewDecoder(w1.Body).Decode(&resp1); err != nil {
		t.Fatalf("decode first response: %v", err)
	}
	agentID1, _ := resp1["id"].(string)
	if agentID1 == "" {
		t.Fatalf("first CreateAgent: no id in response: %v", resp1)
	}

	// Second call — same name must be rejected with 409 Conflict.
	// The unique constraint prevents silent duplicates; the UI shows a clear error.
	body["description"] = "updated description"
	w2 := httptest.NewRecorder()
	testHandler.CreateAgent(w2, newRequest(http.MethodPost, "/api/agents", body))
	if w2.Code != http.StatusConflict {
		t.Fatalf("second CreateAgent with duplicate name: expected 409, got %d: %s", w2.Code, w2.Body.String())
	}
}

// createAgentBody returns a valid CreateAgentRequest body with the given
// overrides merged on top of the mandatory fields.
func createAgentBody(t *testing.T, name string, overrides map[string]any) map[string]any {
	t.Helper()
	body := map[string]any{
		"name":                 name,
		"description":          "",
		"runtime_id":           testRuntimeID,
		"visibility":           "private",
		"max_concurrent_tasks": 1,
	}
	for k, v := range overrides {
		body[k] = v
	}
	return body
}

// Primary agents must not carry a repo_url — the workspace-repos coupling is
// a repo-agent-only concept.
func TestCreateAgent_PrimaryWithRepoURL_Rejected(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(),
			`DELETE FROM agent WHERE workspace_id = $1 AND name = $2`,
			testWorkspaceID, "primary-with-repo-agent",
		)
	})

	body := createAgentBody(t, "primary-with-repo-agent", map[string]any{
		"agent_type": "primary",
		"repo_url":   "https://github.com/acme/widgets.git",
	})

	w := httptest.NewRecorder()
	testHandler.CreateAgent(w, newRequest(http.MethodPost, "/api/agents", body))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "primary agents cannot have a repo_url") {
		t.Errorf("expected reason in body, got %s", w.Body.String())
	}
}

// Repo agents require a repo_url.
func TestCreateAgent_RepoWithoutRepoURL_Rejected(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(),
			`DELETE FROM agent WHERE workspace_id = $1 AND name = $2`,
			testWorkspaceID, "repo-missing-url-agent",
		)
	})

	body := createAgentBody(t, "repo-missing-url-agent", map[string]any{
		"agent_type": "repo",
	})

	w := httptest.NewRecorder()
	testHandler.CreateAgent(w, newRequest(http.MethodPost, "/api/agents", body))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "repo agents require a repo_url") {
		t.Errorf("expected reason in body, got %s", w.Body.String())
	}
}

// Repo agents must pick a URL from the workspace's registered repos so the
// daemon has something to pre-clone.
func TestCreateAgent_RepoWithUnregisteredURL_Rejected(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(),
			`DELETE FROM agent WHERE workspace_id = $1 AND name = $2`,
			testWorkspaceID, "repo-unregistered-agent",
		)
	})
	setHandlerTestWorkspaceRepos(t, []map[string]string{
		{"url": "https://github.com/acme/known.git", "description": "registered"},
	})

	body := createAgentBody(t, "repo-unregistered-agent", map[string]any{
		"agent_type": "repo",
		"repo_url":   "https://github.com/acme/unknown.git",
	})

	w := httptest.NewRecorder()
	testHandler.CreateAgent(w, newRequest(http.MethodPost, "/api/agents", body))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "not a registered workspace repository") {
		t.Errorf("expected reason in body, got %s", w.Body.String())
	}
}

// Happy path: a repo agent with a registered repo_url returns 201 and the
// AgentType + RepoURL round-trip back through the response body.
func TestCreateAgent_RepoWithRegisteredURL_Created(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(),
			`DELETE FROM agent WHERE workspace_id = $1 AND name = $2`,
			testWorkspaceID, "repo-ok-agent",
		)
	})
	repoURL := "https://github.com/acme/ok.git"
	setHandlerTestWorkspaceRepos(t, []map[string]string{
		{"url": repoURL, "description": "registered"},
	})

	body := createAgentBody(t, "repo-ok-agent", map[string]any{
		"agent_type": "repo",
		"repo_url":   repoURL,
	})

	w := httptest.NewRecorder()
	testHandler.CreateAgent(w, newRequest(http.MethodPost, "/api/agents", body))
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got, _ := resp["agent_type"].(string); got != "repo" {
		t.Errorf("agent_type: expected repo, got %v", resp["agent_type"])
	}
	if got, _ := resp["repo_url"].(string); got != repoURL {
		t.Errorf("repo_url: expected %s, got %v", repoURL, resp["repo_url"])
	}
}

// agent_type and repo_url are immutable — PATCH must reject any attempt to
// change them and point the caller at archive-and-recreate.
func TestUpdateAgent_RejectsAgentTypeChange(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	agentID := createHandlerTestAgent(t, "immutable-type-agent", nil)

	req := newRequest(http.MethodPatch, "/api/agents/"+agentID, map[string]any{
		"agent_type": "repo",
	})
	req = withURLParam(req, "id", agentID)

	w := httptest.NewRecorder()
	testHandler.UpdateAgent(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "agent_type is immutable") {
		t.Errorf("expected immutability message, got %s", w.Body.String())
	}
}

func TestUpdateAgent_RejectsRepoURLChange(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	agentID := createHandlerTestAgent(t, "immutable-repo-url-agent", nil)

	req := newRequest(http.MethodPatch, "/api/agents/"+agentID, map[string]any{
		"repo_url": "https://github.com/acme/whatever.git",
	})
	req = withURLParam(req, "id", agentID)

	w := httptest.NewRecorder()
	testHandler.UpdateAgent(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "repo_url is immutable") {
		t.Errorf("expected immutability message, got %s", w.Body.String())
	}
}
