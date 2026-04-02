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

