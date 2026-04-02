# Implementation Phase

Implement feature according to: [PLAN FILE PATH from user]

**PROCESS:**

1. **Create Todo List**: Use TodoWrite to track implementation progress
2. **Read Plan**: Read the plan file carefully
3. **Load Skills**: Search and read all referenced skills (include `testing.md`)
4. **Create Branch**:
   ```bash
   git checkout -b [feature-name]
   git push -u origin [feature-name]
   ```
5. **Create Draft PR Immediately**:
   ```bash
   gh pr create --draft \
     --title "🚧 WIP: [Feature Name]" \
     --body "See docs/plans/YYYY-MM-DD-feature-name.md"
   ```
6. **Follow TDD Cycle** (Red → Green → Refactor):
   - **Red**: Write/update Jest test that fails
   - **Green**: Implement minimal code to pass
   - **Refactor**: Clean up while keeping tests green

7. **For Each Task**:
   - Make code changes following patterns from skills
   - Run targeted tests: `pytest tests/test_feature.py -v`
   - Keep code clean (DRY, YAGNI, KISS)
   - Push commits frequently (backup points):
     ```bash
     git add .
     git commit -m "wip: implement [task]"
     git push
     ```

8. **Update Plan Status**:
   - Update frontmatter: `status: "Implemented in Dev"`
   - Add implementation notes to plan file

9. **Update Plan Tracker**: Move from "Planned" to "In Progress" in `docs/plan-status-overview.md`

10. **STOP**: Notify user completion, DO NOT commit final changes, DO NOT convert PR to ready

**NOTE:** Notion sync is automated - Lizi's cron will update Notion board at 1pm/8pm CT

**IMPORTANT:**
- Follow plan exactly - don't deviate without asking
- Use patterns from skills, not new approaches
- Keep user updated every 3-4 tasks
- Push commits often (backup/rollback points)
- DO NOT finalize anything - just make changes
