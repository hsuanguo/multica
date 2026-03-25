package execenv

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// writeContextFiles renders and writes .agent_context/issue_context.md into workDir.
func writeContextFiles(workDir string, ctx TaskContextForEnv) error {
	contextDir := filepath.Join(workDir, ".agent_context")
	if err := os.MkdirAll(contextDir, 0o755); err != nil {
		return fmt.Errorf("create .agent_context dir: %w", err)
	}

	content := renderIssueContext(ctx)
	path := filepath.Join(contextDir, "issue_context.md")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write issue_context.md: %w", err)
	}
	return nil
}

// renderIssueContext builds the markdown content for issue_context.md.
// Sections with empty content are omitted.
func renderIssueContext(ctx TaskContextForEnv) string {
	var b strings.Builder

	if ctx.IssueTitle != "" {
		fmt.Fprintf(&b, "# Issue: %s\n\n", ctx.IssueTitle)
	}

	if ctx.IssueDescription != "" {
		b.WriteString("## Description\n\n")
		b.WriteString(ctx.IssueDescription)
		b.WriteString("\n\n")
	}

	if len(ctx.AcceptanceCriteria) > 0 {
		b.WriteString("## Acceptance Criteria\n\n")
		for _, item := range ctx.AcceptanceCriteria {
			fmt.Fprintf(&b, "- %s\n", item)
		}
		b.WriteString("\n")
	}

	if len(ctx.ContextRefs) > 0 {
		b.WriteString("## Context References\n\n")
		for _, ref := range ctx.ContextRefs {
			fmt.Fprintf(&b, "- %s\n", ref)
		}
		b.WriteString("\n")
	}

	if ctx.WorkspaceContext != "" {
		b.WriteString("## Workspace Context\n\n")
		b.WriteString(ctx.WorkspaceContext)
		b.WriteString("\n\n")
	}

	if ctx.AgentSkills != "" {
		b.WriteString("## Agent Instructions\n\n")
		b.WriteString(ctx.AgentSkills)
		b.WriteString("\n")
	}

	return b.String()
}
