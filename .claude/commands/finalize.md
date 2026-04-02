# Finalization Phase

Finalize feature according to: [PLAN FILE PATH from user]

**PROCESS:**

1. **Create Todo List**: Use TodoWrite to track finalization progress

2. **Verify All Tests Pass**:
   ```bash
   pytest tests/ -v
   ```
   **CRITICAL**: If tests fail, STOP and return to implementation

3. **Run Full Linting**:
   ```bash
   black liziscript/
   mypy liziscript/
   ruff check liziscript/ --fix
   ```

4. **Update Documentation**:
   - Add/update docstrings (Google style)
   - Update README if needed
   - Update API docs if endpoints changed

5. **Update Plan File**:
   - Frontmatter: `status: "Complete"`
   - Add finalization notes

6. **Create Final Commit**:
   ```bash
   git add .
   git commit -m "feat: [concise description]

   [Detailed explanation if needed]

   Closes #[issue-number]

   🤖 Generated with Claude Code

   Co-Authored-By: Claude <noreply@anthropic.com>"

   git push
   ```

7. **Convert PR to Ready**:
   ```bash
   gh pr ready
   gh pr edit --add-label "ready-for-review"
   ```

8. **Update Plan Tracker**: Move from "Code Review" to "Done" in `docs/plan-status-overview.md`

9. **Verify Everything**:
    ```bash
    # Run verification commands from Implementation Report
    [commands from plan file]

    # Show output - NEVER claim without proof
    ```

10. **Close GitHub Issue**:
    ```bash
    gh issue close [issue-number] --comment "Completed in PR #[pr-number]"
    ```

11. **STOP**: Report completion with PR link and verification output

**NOTE:** Notion sync is automated - Lizi's cron will update Notion board at 1pm/8pm CT

**VERIFICATION CHECKLIST:**
- [ ] All tests passing (`pytest tests/ -v`)
- [ ] Linting clean (black, mypy, ruff)
- [ ] Coverage >80% (`pytest --cov`)
- [ ] Documentation updated
- [ ] Commit message follows conventions
- [ ] PR converted to ready
- [ ] GitHub issue closed
- [ ] Plan tracker updated (Notion syncs automatically)
- [ ] Verification commands run successfully

**IMPORTANT:**
- NEVER skip verification - show actual output
- NEVER merge PR - user will review and merge
- If anything fails, return to implementation or review phase
- Do NOT claim completion without evidence
