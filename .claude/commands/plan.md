# Planning Phase

I need to plan implementation for: [FEATURE NAME from user]

**PROCESS:**

1. **Create Todo List**: Use TodoWrite to track planning progress

2. **Gather Context** (before asking questions):
   - `notion-cli search "<feature>" --json` — find existing task/requirements/brainstorm notes
   - If found: `notion-cli pages get <page_id> --markdown --json` — pull requirements into context
   - `context7-skill diff` — check if new libraries are needed for this feature
   - `context7-skill docs <library> <query>` — pre-cache docs for any new tech mentioned
   - `supabase-skill context <relevant-table>` — pull schema for tables involved
   - Use `codegraph_context` / `codegraph_search` — explore related code and symbols
   - `git-skill search "<feature>"` — check if this was attempted before
   - `git-skill timeline <file>` — review history of files you plan to change
   - `git-skill hotspots` — identify unstable files to approach carefully
   - Search `.claude/skills/` for relevant patterns

3. **Check Git History**: Before designing changes, verify nothing was tried and reverted:
   ```bash
   git-skill search "<feature keywords>"     # prior attempts
   git-skill search "revert" | grep "<file>"  # reverted changes on target files
   git-skill coupling <file>                  # what co-changes with it
   ```
   If a similar approach was tried and reverted, note it in the plan and explain why this attempt is different.

4. **Search Similar Features**: Use codegraph to find similar working features in the project

5. **Ask Questions**: Use AskUserQuestion for clarification (one at a time, max 5-7 questions)

6. **Propose Approach**: Provide TLDR summary referencing patterns (for quick approval)

7. **Verify Context**:
   - `context7-skill libs` — confirm all needed library docs are cached
   - `supabase-skill doctor` — confirm schema snapshot is fresh
   - If stale: run `context7-skill snapshot` / `supabase-skill snapshot`

8. **Write Plan**: Create detailed plan at `docs/plans/YYYY-MM-DD-[feature-name].md`

**PLAN STRUCTURE:**
```yaml
---
feature_name: "Feature Name"
planned_date: "YYYY-MM-DD"
ai_model: "claude-opus-4-6"
status: "Planned"
notion_task_url: "https://notion.so/..." (if found)
---

# TLDR
2-3 sentence summary of implementation approach

# Context Gathered
- **Notion**: [task/requirements found or "none"]
- **Libraries**: [cached libs relevant to this feature]
- **Schema**: [tables explored via supabase-skill]
- **Related code**: [symbols/files found via codegraph]

# Requirements Summary
- Bullet points of key requirements

# Architecture Approach
- How this fits into existing architecture
- Which patterns/skills to use
- Database schema changes (if any)

# Implementation Steps
1. Step 1 (reference: [skill-name])
2. Step 2 (reference: [skill-name])
...

# Files to Modify/Create
- `path/to/file.py` - Description
- `path/to/test.py` - Test coverage

# Testing Approach
- Unit tests: ...
- Integration tests: ...
- Verification commands: ...

# Documentation Updates
- What docs need updating
```

9. **Create GitHub Issue**: Create issue with plan summary and link

10. **Update Tracking**:
   - Add to `docs/plan-status-overview.md` under "Planned" section
   - Update Notion task status if one exists:
     `notion-cli pages update <page_id> --properties '{"Status":{"select":{"name":"Planned"}}}'`

11. **STOP**: Wait for approval - DO NOT start implementation

**CRITICAL RULES:**
- Plans and design specs live in **git repo** (`docs/plans/`, `docs/design/`)
- Notion tracks **tasks, brainstorming, and final documentation** — NOT plans
- Notion sync also runs via cron (plan-status-overview.md → Notion at 1pm/8pm CT)
- Reference specific skills for each task
- Be concise - plan is for YOU to implement later
- Include TLDR at top for quick review
- DO NOT start coding
