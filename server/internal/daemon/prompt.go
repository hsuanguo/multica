package daemon

import (
	"fmt"
	"strings"
)

// BuildPrompt constructs the task prompt for an agent CLI.
// Full context is available in .agent_context/issue_context.md (written by execenv).
// The prompt contains a brief summary for immediate context.
func BuildPrompt(task Task) string {
	var b strings.Builder
	b.WriteString("You are running as a local coding agent for a Multica workspace.\n")
	b.WriteString("Complete the assigned issue using the local environment.\n\n")

	b.WriteString("## Context\n\n")
	b.WriteString("Full issue context is available in `.agent_context/issue_context.md` in your working directory.\n")
	b.WriteString("Read this file first for the complete issue description, acceptance criteria, and instructions.\n\n")

	fmt.Fprintf(&b, "**Issue:** %s\n", task.Context.Issue.Title)
	fmt.Fprintf(&b, "**Agent:** %s\n\n", task.Context.Agent.Name)

	if task.Context.Issue.Description != "" {
		desc := task.Context.Issue.Description
		if len(desc) > 200 {
			desc = desc[:200] + "..."
		}
		fmt.Fprintf(&b, "**Summary:** %s\n\n", desc)
	}

	if len(task.Context.Issue.AcceptanceCriteria) > 0 {
		b.WriteString("## Acceptance Criteria\n\n")
		for _, item := range task.Context.Issue.AcceptanceCriteria {
			fmt.Fprintf(&b, "- %s\n", item)
		}
		b.WriteString("\n")
	}

	b.WriteString("## Output Requirements\n\n")
	b.WriteString("Return a concise Markdown comment suitable for posting back to the issue.\n")
	b.WriteString("- Lead with the outcome.\n")
	b.WriteString("- Mention concrete files or commands if you changed anything.\n")
	b.WriteString("- If blocked, explain the blocker clearly.\n")

	return b.String()
}
