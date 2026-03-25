package daemon

import (
	"net/http"
	"strings"
	"testing"
)

func TestNormalizeServerBaseURL(t *testing.T) {
	t.Parallel()

	got, err := NormalizeServerBaseURL("ws://localhost:8080/ws")
	if err != nil {
		t.Fatalf("NormalizeServerBaseURL returned error: %v", err)
	}
	if got != "http://localhost:8080" {
		t.Fatalf("expected http://localhost:8080, got %s", got)
	}
}

func TestBuildPromptIncludesIssueAndContext(t *testing.T) {
	t.Parallel()

	prompt := BuildPrompt(Task{
		Context: TaskContext{
			Issue: IssueContext{
				Title:              "Fix failing test",
				Description:        "Investigate and fix the test failure.",
				AcceptanceCriteria: []string{"tests pass"},
			},
			Agent: AgentContext{
				Name:   "Local Codex",
				Skills: "Be concise.",
			},
		},
	})

	for _, want := range []string{
		"Fix failing test",
		"Investigate and fix the test failure.",
		"tests pass",
		".agent_context/issue_context.md",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q", want)
		}
	}
}

func TestBuildPromptTruncatesLongDescription(t *testing.T) {
	t.Parallel()

	longDesc := strings.Repeat("x", 300)
	prompt := BuildPrompt(Task{
		Context: TaskContext{
			Issue: IssueContext{
				Title:       "Long desc",
				Description: longDesc,
			},
			Agent: AgentContext{Name: "Test"},
		},
	})

	if strings.Contains(prompt, longDesc) {
		t.Fatal("expected long description to be truncated in prompt")
	}
	if !strings.Contains(prompt, "...") {
		t.Fatal("expected truncation marker")
	}
}

func TestIsWorkspaceNotFoundError(t *testing.T) {
	t.Parallel()

	err := &requestError{
		Method:     http.MethodPost,
		Path:       "/api/daemon/register",
		StatusCode: http.StatusNotFound,
		Body:       `{"error":"workspace not found"}`,
	}
	if !isWorkspaceNotFoundError(err) {
		t.Fatal("expected workspace not found error to be recognized")
	}

	if isWorkspaceNotFoundError(&requestError{StatusCode: http.StatusInternalServerError, Body: `{"error":"workspace not found"}`}) {
		t.Fatal("did not expect 500 to be treated as workspace not found")
	}
}
