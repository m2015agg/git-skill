export const WALKTHROUGH = `# Git History Walkthrough

Use git-skill to explore this repository's history.

## Quick Start
\`\`\`
git-skill doctor          # Check setup health
git-skill hotspots        # Find churning files
git-skill trends          # View metric trends
git-skill search "auth"   # Search history
\`\`\`
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
   - Push commits frequently (backup points):
     \`\`\`bash
     git add . && git commit -m "wip: [task]" && git push
     \`\`\`

6. **STOP**: Notify completion — DO NOT finalize or merge

**IMPORTANT:**
- Follow plan exactly — don't deviate without asking
- Push commits often (rollback points)
- Keep user updated every 3-4 tasks
- DO NOT finalize — just implement
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

Review the current branch changes before merging.

**PROCESS:**

1. **Run tests**:
   \`\`\`bash
   # Run the project's test suite (adjust command for your project)
   npm test        # Node.js
   # pytest         # Python
   # cargo test     # Rust
   \`\`\`

2. **Git History Verification** (prevent re-trying failed approaches):
   \`\`\`bash
   git-skill verify
   \`\`\`
   If \`git-skill verify\` returns WARN or BLOCK:
   - **BLOCK**: STOP. This change re-introduces something that was explicitly reverted. Ask the user before proceeding.
   - **WARN**: Note the warning. Check if the current approach addresses the previous failure. Proceed with caution.
   - **PASS**: No concerns from history.

3. **Check codebase health**:
   \`\`\`bash
   git-skill doctor
   git-skill hotspots --limit 5
   \`\`\`
   Flag any files being modified that appear in the hotspots list.

4. **Review against criteria**:
   - **Critical** (must fix): Security vulnerabilities, data loss risks, breaking changes, tests failing
   - **Major** (should fix): Missing error handling, pattern violations, missing tests
   - **Minor** (optional): Style, docs, optimization

5. **Auto-fix critical/major issues**:
   - Fix issues following established patterns
   - Run tests after each fix
   - Commit fixes separately

6. **Report findings**:
   - List issues found and fixed
   - List any WARN/BLOCK from git-skill verify
   - Provide verification commands
   - Recommend proceeding or returning to implementation

**IMPORTANT:**
- \`git-skill verify\` is authoritative — if it says something was reverted before, take it seriously
- Auto-fix critical/major issues, don't just report them
- Always run tests after fixes
`;

