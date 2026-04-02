# Code Review Phase

Review implementation according to: [PLAN FILE PATH from user]

**PROCESS:**

1. **Create Todo List**: Use TodoWrite to track review progress

2. **Read Plan and Review Criteria**:
   - Read the plan file
   - Read `.claude/skills/testing.md` for test standards
   - Read `.claude/skills/supabase-integration.md` for database patterns

3. **Test New Features First** (before full regression):
   ```bash
   # Identify new/modified test files in this branch
   NEW_TESTS=$(git diff main...$(git branch --show-current) --name-only | grep "tests/.*\.py$")
   
   if [ -n "$NEW_TESTS" ]; then
     echo "================================================"
     echo "TESTING NEW FEATURES (M2 changes):"
     echo "================================================"
     echo "$NEW_TESTS"
     echo ""
     
     # Run new tests first on remote server
     ssh root@100.98.82.108 "cd /root/bibleai/BibleLizi_API && docker exec biblelizi-api pytest $NEW_TESTS -v --tb=short"
     
     # Exit if new tests fail - don't run full regression
     if [ $? -ne 0 ]; then
       echo "❌ NEW FEATURE TESTS FAILED - Fix these before running full regression"
       exit 1
     fi
     
     echo "✅ NEW FEATURE TESTS PASSED - Proceeding to full regression"
   else
     echo "⚠️  No new test files detected in branch"
   fi
   ```

4. **Run Full Test Suite** (only if new tests passed):
   ```bash
   pytest tests/ -v --cov=liziscript --cov-report=term-missing
   ```

6. **Check Code Quality**:
   ```bash
   # Linting
   black liziscript/ --check
   mypy liziscript/
   ruff check liziscript/

   # Coverage (target >80%)
   pytest --cov-report=html
   ```

7. **Git History Verification** (prevent re-trying failed approaches):
   ```bash
   # Check staged changes against git history for prior attempts
   git-skill verify
   ```
   If `git-skill verify` flags a previously reverted approach, STOP and ask the user before proceeding. The git history is authoritative — if something was tried and reverted, there was a reason.

8. **Review Against Criteria**:
   - **Critical Issues** (must fix):
     - Security vulnerabilities (SQL injection, XSS, etc.)
     - Data loss risks
     - Breaking changes without migrations
     - Missing `.schema('bibleai')` in Supabase queries
     - Tests failing
     - Coverage < 80%

   - **Major Issues** (should fix):
     - Pattern violations (not following skills)
     - Missing error handling
     - No retry logic on external APIs
     - Missing database indexes
     - Inconsistent naming

   - **Minor Issues** (optional):
     - Style/formatting (if linter didn't catch)
     - Documentation improvements
     - Optimization opportunities

9. **Auto-Fix Critical/Major Issues**:
   - Fix issues following established patterns
   - Run tests after each fix
   - Commit fixes:
     ```bash
     git add .
     git commit -m "fix: [description]"
     git push
     ```

10. **Write Implementation Report**:
   - Add to top of plan file (after frontmatter):
   ```markdown
   # Implementation Report

   **Implementation Date**: YYYY-MM-DD
   **Status**: Code Review Complete

   ## Quality Assessment
   - Tests: [X] passing, coverage [Y]%
   - Linting: [pass/fail]
   - Patterns: [followed/violations noted]

   ## Issues Found and Fixed
   ### Critical
   - Issue 1: Description → Fixed in commit [hash]

   ### Major
   - Issue 1: Description → Fixed in commit [hash]

   ### Minor (Not Fixed)
   - Issue 1: Description (optional improvement)

   ## Manual UAT Steps
   1. Verify [X] by running [command]
   2. Check [Y] by querying [database]
   3. Confirm [Z] by testing [scenario]

   ## Verification Commands
   ```bash
   # Run these to verify implementation
   pytest tests/test_feature.py -v
   docker exec container python script.py [args]
   [database query]
   ```
   ```

11. **Update Notion**: Change status to "Code Review"

12. **Update Plan Tracker**: Move from "In Progress" to "Code Review" in `docs/plan-status-overview.md`

13. **Write Results File**: Create tracking file for state sync
```bash
SLUG="[feature-name-slug]"
BRANCH=$(git branch --show-current)

# Capture test status
if pytest tests/ -v --tb=no 2>&1 | grep -q "passed"; then
  TEST_STATUS="passing"
else
  TEST_STATUS="failing"
fi

# Capture coverage if available
COVERAGE=$(pytest --cov=liziscript --cov-report=term 2>/dev/null | grep "TOTAL" | awk '{print $NF}' || echo "unknown")

cat > .claude/runs/${SLUG}-review.json << EOF
{
  "slug": "${SLUG}",
  "phase": "review",
  "timestamp": "$(date -Iseconds)",
  "branch": "${BRANCH}",
  "test_status": "${TEST_STATUS}",
  "coverage": "${COVERAGE}"
}
EOF
```

14. **STOP**: Report findings, wait for user to debug or finalize

**IMPORTANT:**
- Auto-fix critical/major issues - don't just report
- Provide verification commands - never claim without proof
- Be specific about what needs fixing
- If issues found, recommend returning to implementation phase
