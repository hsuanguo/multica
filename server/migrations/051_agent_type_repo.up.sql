-- Introduces two first-class agent types:
--   * primary: today's behavior. No repo binding; cwd = per-task workdir.
--   * repo:    bound to a single workspace repo at creation time.
--              Daemon pre-clones the repo and spawns the agent with
--              cwd = <worktree root> so tools like Claude Code auto-load
--              the repo's own CLAUDE.md / .claude/skills/.
ALTER TABLE agent
    ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'primary'
        CHECK (agent_type IN ('primary', 'repo')),
    ADD COLUMN repo_url TEXT;

-- Consistency: repo agents require a repo_url; primary agents must not have one.
ALTER TABLE agent
    ADD CONSTRAINT agent_repo_url_matches_type
    CHECK (
        (agent_type = 'primary' AND repo_url IS NULL) OR
        (agent_type = 'repo'    AND repo_url IS NOT NULL AND repo_url <> '')
    );
