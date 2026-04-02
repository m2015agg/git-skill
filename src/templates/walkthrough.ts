export const WALKTHROUGH = `---
description: Interactive walkthrough of git history — hotspots, decisions, expertise, health trends via git-skill CLI
allowed-tools: Read, Bash(git-skill:*)
---

# /git-history — Codebase History Walkthrough

When the user invokes this command, guide them through their codebase history interactively.

## Steps

1. **Check setup health**
   Run: \`git-skill doctor\`
   Confirm the database is fresh and hook is installed. Note commit count and snapshot age.

2. **Show what's churning**
   Run: \`git-skill hotspots --limit 10\`
   Explain which files have the most churn. Flag any that are suspicious (high edit count in a short period = instability).

3. **Show recent decisions**
   Run: \`git-skill decisions --limit 10\`
   Walk through the major decision points — reverts, big refactors, architecture changes. Explain the impact of each.

4. **Health trends**
   Run: \`git-skill trends\`
   Summarize the metric trends: is revert rate going up or down? Is scope creep improving? Are commits getting smaller or larger?

5. **Explore a specific area**
   Ask the user which file or directory they want to investigate, or pick the top hotspot.
   Run: \`git-skill timeline <path>\`
   Show the full evolution — every commit, who made it, what changed.

6. **Who knows what**
   Run: \`git-skill experts <path>\` (using the path from step 5)
   Show who has the most context on that area of the codebase.

7. **Check for co-change patterns**
   Run: \`git-skill coupling <path>\`
   Reveal files that always change together — hidden dependencies the team should know about.

8. **Open Q&A**
   Say: "Ask me anything about your codebase history — I can search commits, trace file evolution, find decision points, or check what was tried before."

## Tips
- Use \`git-skill search "<query>"\` for free-text search across all commits and file paths
- Use \`git-skill why <hash>\` to understand the intent behind any commit (requires enrichment)
- Use \`git-skill verify\` before committing to check if staged changes repeat past mistakes
- Use \`git-skill diff-summary v1.0..v1.1\` for a release-level summary between two refs
- Use \`git-skill regression\` to detect change-point shifts in metrics
`;


export const PLAN_COMMAND = `---
description: "Plan a feature with git history awareness — checks what was tried before"
---

# Planning Phase

Plan implementation for the requested feature.

**PROCESS:**

1. **Gather Context**:
   - \`git-skill search "<feature>"\` — check if this was attempted before
   - \`git-skill timeline <file>\` — review history of files you plan to change
   - \`git-skill hotspots\` — identify unstable files to approach carefully
   - \`git-skill coupling <file>\` — what co-changes with target files

2. **Check Git History**: Before designing changes, verify nothing was tried and reverted:
   \`\`\`bash
   git-skill search "<feature keywords>"
   git-skill decisions --type revert
   \`\`\`
   If a similar approach was tried and reverted, note it in the plan and explain why this attempt is different.

3. **Ask Questions**: Clarify requirements (max 5-7 questions)

4. **Write Plan**: Create plan at \`docs/plans/YYYY-MM-DD-[feature-name].md\`

**PLAN STRUCTURE:**
\`\`\`markdown
# Feature Name

## TLDR
2-3 sentence summary

## Context from Git History
- Prior attempts: [what git-skill found]
- Hotspot files: [files to be careful with]
- Related decisions: [reverts, refactors that matter]

## Requirements
- Bullet points

## Implementation Steps
1. Step 1
2. Step 2

## Files to Modify/Create
- \`path/to/file\` — description

## Testing
- How to verify this works
\`\`\`

5. **Create GitHub Issue**: \`gh issue create --title "feat: ..." --body "See docs/plans/..."\`

6. **STOP**: Wait for approval — DO NOT start implementation

**CRITICAL:**
- Check git history FIRST — don't re-try reverted approaches
- Plans live in git (\`docs/plans/\`), not external tools
- Be concise — the plan is for implementation, not documentation
`;

export const IMPLEMENT_COMMAND = `---
description: "Implement a planned feature with TDD and frequent commits"
---

# Implementation Phase

Implement feature according to the plan file.

**PROCESS:**

1. **Read Plan**: Read the plan file carefully
2. **Create Branch**:
   \`\`\`bash
   git checkout -b [feature-name]
   git push -u origin [feature-name]
   \`\`\`
3. **Create Draft PR**:
   \`\`\`bash
   gh pr create --draft --title "WIP: [Feature Name]" --body "See docs/plans/..."
   \`\`\`
4. **Follow TDD** (Red → Green → Refactor):
   - Write test that fails
   - Implement minimal code to pass
   - Refactor while keeping tests green

5. **For Each Task**:
   - Make changes following existing patterns in the codebase
   - Run tests after each change
   - Commit and push frequently (backup points):
     \`\`\`bash
     git add . && git commit -m "wip: [task]" && git push
     \`\`\`

6. **STOP**: Notify completion — DO NOT finalize or merge

**IMPORTANT:**
- Follow plan exactly — don't deviate without asking
- Push commits often (rollback points)
- Keep user updated every 3-4 tasks
- DO NOT finalize — just implement
- The /review phase will soft-reset the last commit to run verify on staged changes
`;

export const FINALIZE_COMMAND = `---
description: "Finalize a feature — tests, lint, commit, PR ready"
---

# Finalization Phase

Finalize the implemented feature.

**PROCESS:**

1. **Verify Tests Pass**:
   \`\`\`bash
   # Run your project's test suite
   npm test        # Node.js
   # pytest tests/  # Python
   # cargo test     # Rust
   \`\`\`
   If tests fail, STOP and return to implementation.

2. **Run git-skill verify**:
   \`\`\`bash
   git-skill verify
   \`\`\`
   Address any WARN or BLOCK findings before proceeding.

3. **Update Documentation**: Add/update docs if needed

4. **Create Final Commit**:
   \`\`\`bash
   git add .
   git commit -m "feat: [description]

   Closes #[issue-number]"
   git push
   \`\`\`

5. **Convert PR to Ready**:
   \`\`\`bash
   gh pr ready
   \`\`\`

6. **Run Final Verification**:
   \`\`\`bash
   git-skill doctor
   git-skill hotspots --limit 3
   \`\`\`
   Show output — never claim completion without proof.

7. **STOP**: Report completion with PR link and verification output

**CHECKLIST:**
- [ ] All tests passing
- [ ] \`git-skill verify\` — no BLOCK findings
- [ ] Documentation updated
- [ ] Commit message follows conventions
- [ ] PR converted to ready
- [ ] Verification output shown

**IMPORTANT:**
- NEVER skip verification
- NEVER merge PR — user reviews and merges
- If anything fails, return to implementation
`;

export const REVIEW_COMMAND = `---
description: "Code review with git history verification — checks for repeated mistakes before merge"
---

# Code Review with History Verification

Review branch changes before merging. Soft-resets last commit to run verify on staged changes.

**PROCESS:**

1. **Soft-reset to get staged changes for verify**:
   \`\`\`bash
   git reset --soft HEAD~1
   \`\`\`
   This unstages the last commit but keeps all changes staged — exactly what \`git-skill verify\` needs.

2. **Run tests**:
   \`\`\`bash
   # Run the project's test suite (adjust command for your project)
   npm test        # Node.js
   # pytest         # Python
   # cargo test     # Rust
   \`\`\`

3. **Git History Verification** (prevent re-trying failed approaches):
   \`\`\`bash
   git-skill verify
   \`\`\`
   If \`git-skill verify\` returns WARN or BLOCK:
   - **BLOCK**: STOP. This change re-introduces something that was explicitly reverted. Ask the user before proceeding.
   - **WARN**: Note the warning. Check if the current approach addresses the previous failure. Proceed with caution.
   - **PASS**: No concerns from history.

4. **Review scope and codebase health**:
   \`\`\`bash
   git-skill diff-summary HEAD~5..HEAD    # summarize recent branch changes
   git-skill hotspots --limit 5           # flag churning files
   \`\`\`
   Flag any modified files that appear in the hotspots list.

5. **Review against criteria**:
   - **Critical** (must fix): Security vulnerabilities, data loss risks, breaking changes, tests failing
   - **Major** (should fix): Missing error handling, pattern violations, missing tests
   - **Minor** (optional): Style, docs, optimization

6. **Auto-fix critical/major issues**:
   - Fix issues following established patterns
   - Run tests after each fix
   - Re-stage fixed files: \`git add <fixed-files>\`

7. **Re-commit after review passes**:
   \`\`\`bash
   git commit -m "feat: [description]"
   git push
   \`\`\`

8. **Report findings**:
   - List issues found and fixed
   - List any WARN/BLOCK from git-skill verify
   - Provide verification commands
   - Recommend proceeding to /finalize or returning to /implement

**IMPORTANT:**
- Step 1 soft-resets the WIP commit so verify can inspect staged changes
- \`git-skill verify\` only works on STAGED changes — this is why we reset first
- \`git-skill verify\` is authoritative — if it says something was reverted before, take it seriously
- Auto-fix critical/major issues, don't just report them
- Always run tests after fixes
- Re-commit with a clean message after review passes
`;

export const TRACE_COMMAND = `---
description: "Debug unexpected behavior by tracing broken assumptions across git history"
allowed-tools: Read, Bash(git-skill:*)
---

# Historical Context Debugging

Trace broken assumptions in code using git-skill history. Use when behavior is wrong but code looks correct in isolation.

**PROCESS:**

1. **Name the symptom precisely** (not "it's slow" — say what specifically is wrong)
2. **Follow the investigation workflow**:
   - \`git-skill search "<feature keyword>"\` — find related commits
   - \`git-skill why <hash>\` — understand original intent and assumptions
   - \`git-skill timeline <file>\` — see all changes chronologically
   - \`git-skill search "<later feature>"\` — find changes that might conflict
   - \`git-skill why <later_hash>\` — did the later change consider the original?
3. **Identify the fault type**: Missing Guard, Parallel Evolution, or Stale Side Effect
4. **Fix** and \`git-skill verify\` before committing

**EXAMPLE:**
\`\`\`
/trace Follow-up messages are triggering fresh RAG even when router says conversational
\`\`\`
`;

export const HISTORICAL_CONTEXT_SKILL = `---
name: historical-context-debugging
description: Use when debugging unexpected behavior where the code looks correct in isolation — traces broken assumptions across commits using git-skill to find where later changes invalidated earlier logic
---

# Historical Context Debugging

## Overview

Bugs often aren't in the code you're looking at — they're in the **gap between two changes made months apart**. Feature A was built with assumption X. Feature B was added later and silently violated assumption X. Both look correct in isolation. The bug is invisible without the git history.

This skill uses \`git-skill\` to reconstruct the causal chain: why was the original code written, what assumptions did it make, and which later change broke those assumptions?

## When to Use

- Code looks correct but behaves wrong
- A feature "used to work" but stopped
- You find a guard/flag for one case but not a similar case
- Two subsystems that should be connected aren't
- Cache/config is stale despite code being updated
- You're about to change code but aren't sure why it was written that way

## When NOT to Use

- Bug is clearly a typo or syntax error
- Code was written in the current session
- The issue is in a dependency, not your code

## Quick Reference

| Step | Command | What You Learn |
|------|---------|----------------|
| Find commits | \`git-skill search "feature keyword"\` | Who touched this area and when |
| Understand intent | \`git-skill why <hash>\` | Why the original code was written, what assumptions it made |
| See evolution | \`git-skill timeline <file>\` | All changes to a file in chronological order |
| Find related | \`git-skill search "related feature"\` | Later changes that might affect the same logic |
| Check for reverts | \`git-skill decisions\` | Was this approach tried and rolled back before? |
| Validate fix | \`git-skill verify\` | Does your staged fix repeat a known mistake? |

## The Three Fault Types

### 1. Missing Guard (most common)

Feature A adds a guard for case X. Feature B adds a new case Y that needs the same guard but nobody adds it.

**Signal:** You find a flag/guard for one field but not a similar field.

**Investigation:**
\`\`\`
git-skill search "original_guard"     → find when guard was added
git-skill why <hash>                  → understand why it was needed
git-skill search "new_feature"        → find when new feature was added
git-skill why <hash>                  → did that commit mention the guard? No.
\`\`\`

### 2. Parallel Evolution

Two systems are built independently that should share logic. They diverge because neither knows about the other.

**Signal:** Two different implementations of the same concept, or a new system never wired into existing code paths.

**Investigation:**
\`\`\`
git-skill search "system A"           → find when A was built
git-skill search "system B"           → find when B was built
git-skill timeline <shared_file>      → was B ever connected to A? No.
\`\`\`

### 3. Stale Side Effect

Code change is applied but a side effect (cache, config, external state) isn't updated.

**Signal:** DB/code shows correct value but runtime behavior is wrong.

**Investigation:**
\`\`\`
git-skill search "the change"         → find the update commit
git-skill why <hash>                  → was cache/config invalidation mentioned?
# Then check: is the runtime state matching the code state?
\`\`\`

## Investigation Workflow

### Step 1: Name the symptom precisely
Bad: "Chat is slow"
Good: "Follow-up messages trigger fresh RAG even when router says conversational"

### Step 2: Find the feature that should prevent this
\`\`\`bash
git-skill search "relevant feature"
\`\`\`

### Step 3: Understand the original intent
\`\`\`bash
git-skill why <original_commit>
\`\`\`
Read the enrichment carefully. What **assumptions** did the author make? Write them down.

### Step 4: Find what changed between then and now
\`\`\`bash
git-skill timeline <affected_file> --since <original_date>
git-skill search "feature that might conflict"
\`\`\`

### Step 5: Check each later change against the assumptions
\`\`\`bash
git-skill why <later_commit>
\`\`\`
Ask: "Did this change consider assumption X?" If not, that's your likely fault.

### Step 6: Fix and verify
\`\`\`bash
git add <files>
git-skill verify
\`\`\`

## Common Mistakes

| Mistake | Better |
|---------|--------|
| Grep the code and guess | Use \`git-skill why\` to understand intent first |
| Fix the symptom without tracing the cause | Trace the full causal chain |
| Assume the original code is wrong | Often a later change broke its assumption |
| Skip checking for reverts | \`git-skill decisions\` — someone may have tried your fix and rolled it back |
| Fix one instance of a pattern | Search for ALL instances of the same pattern |
`;
