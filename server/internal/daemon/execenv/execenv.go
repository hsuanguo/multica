// Package execenv manages isolated per-task execution environments for the daemon.
// Each task gets its own directory with a git worktree (for code tasks) or plain
// directory (for non-code tasks), plus injected context files.
package execenv

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// WorkspaceType indicates how the working directory was set up.
type WorkspaceType string

const (
	WorkspaceTypeGitWorktree WorkspaceType = "git_worktree"
	WorkspaceTypeDirectory   WorkspaceType = "directory"
)

// PrepareParams holds all inputs needed to set up an execution environment.
type PrepareParams struct {
	WorkspacesRoot string           // base path for all envs (e.g., ~/multica_workspaces)
	ReposRoot      string           // source git repo (for worktree creation)
	TaskID         string           // task UUID — used for directory name
	AgentName      string           // for git branch naming only
	Task           TaskContextForEnv // context data for writing files
}

// TaskContextForEnv is the subset of task context used for writing context files.
type TaskContextForEnv struct {
	IssueTitle         string
	IssueDescription   string
	AcceptanceCriteria []string
	ContextRefs        []string
	WorkspaceContext   string
	AgentName          string
	AgentSkills        string
}

// Environment represents a prepared, isolated execution environment.
type Environment struct {
	// RootDir is the top-level env directory ({workspacesRoot}/{task_id_short}/).
	RootDir string
	// WorkDir is the directory to pass as Cwd to the agent ({RootDir}/workdir/).
	WorkDir string
	// Type indicates git_worktree or directory.
	Type WorkspaceType
	// BranchName is the git branch name (empty for directory type).
	BranchName string

	gitRoot string      // source repo root (for cleanup)
	logger  *log.Logger // for cleanup logging
}

// Prepare creates an isolated execution environment for a task.
func Prepare(params PrepareParams, logger *log.Logger) (*Environment, error) {
	if params.WorkspacesRoot == "" {
		return nil, fmt.Errorf("execenv: workspaces root is required")
	}
	if params.TaskID == "" {
		return nil, fmt.Errorf("execenv: task ID is required")
	}

	envRoot := filepath.Join(params.WorkspacesRoot, shortID(params.TaskID))

	// Remove existing env if present (defensive — task IDs are unique).
	if _, err := os.Stat(envRoot); err == nil {
		if err := os.RemoveAll(envRoot); err != nil {
			return nil, fmt.Errorf("execenv: remove existing env: %w", err)
		}
	}

	// Create directory tree.
	workDir := filepath.Join(envRoot, "workdir")
	for _, dir := range []string{workDir, filepath.Join(envRoot, "output"), filepath.Join(envRoot, "logs")} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("execenv: create directory %s: %w", dir, err)
		}
	}

	env := &Environment{
		RootDir: envRoot,
		WorkDir: workDir,
		Type:    WorkspaceTypeDirectory,
		logger:  logger,
	}

	// Detect git repo and set up worktree if available.
	if params.ReposRoot != "" {
		if gitRoot, ok := detectGitRepo(params.ReposRoot); ok {
			branchName := fmt.Sprintf("agent/%s/%s", sanitizeName(params.AgentName), shortID(params.TaskID))

			// Get the default branch as base ref.
			baseRef := getDefaultBranch(gitRoot)

			if err := setupGitWorktree(gitRoot, workDir, branchName, baseRef); err != nil {
				logger.Printf("execenv: git worktree setup failed, falling back to directory mode: %v", err)
			} else {
				env.Type = WorkspaceTypeGitWorktree
				env.BranchName = branchName
				env.gitRoot = gitRoot

				// Exclude .agent_context from git tracking.
				if err := excludeFromGit(workDir, ".agent_context"); err != nil {
					logger.Printf("execenv: failed to exclude .agent_context from git: %v", err)
				}
			}
		}
	}

	// Write context files into workdir.
	if err := writeContextFiles(workDir, params.Task); err != nil {
		return nil, fmt.Errorf("execenv: write context files: %w", err)
	}

	logger.Printf("execenv: prepared env root=%s type=%s branch=%s", envRoot, env.Type, env.BranchName)
	return env, nil
}

// Cleanup tears down the execution environment.
// If removeAll is true, the entire env root is deleted. Otherwise, workdir is
// removed but output/ and logs/ are preserved for debugging.
func (env *Environment) Cleanup(removeAll bool) error {
	if env == nil {
		return nil
	}

	// Remove git worktree first (must happen before directory deletion).
	if env.Type == WorkspaceTypeGitWorktree && env.gitRoot != "" {
		removeGitWorktree(env.gitRoot, env.WorkDir, env.BranchName, env.logger)
	}

	if removeAll {
		if err := os.RemoveAll(env.RootDir); err != nil {
			env.logger.Printf("execenv: cleanup removeAll failed: %v", err)
			return err
		}
		return nil
	}

	// Partial cleanup: remove workdir, keep output/ and logs/.
	if err := os.RemoveAll(env.WorkDir); err != nil {
		env.logger.Printf("execenv: cleanup workdir failed: %v", err)
		return err
	}
	return nil
}
