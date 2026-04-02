# Development Workflow with git-skill

git-skill installs four slash commands that create a gated development workflow. Each phase has a clear entry point, process, and stop condition — Claude won't skip ahead without your approval.

## The Four Phases

```
/plan → /implement → /review → /finalize
  │         │            │          │
  │         │            │          └─ Tests, verify, PR ready, STOP
  │         │            └─ git-skill verify, fix issues, STOP
  │         └─ TDD, frequent commits, draft PR, STOP
  └─ Git history check, design, write plan, STOP
```

Each phase ends with **STOP** — Claude reports what it did and waits for you to approve the next phase.

## Phase 1: `/plan [feature]`

**What it does:** Plans a feature by first checking git history for prior attempts, then designing the approach.

**git-skill integration:**
- `git-skill search "<feature>"` — finds prior attempts at this feature
- `git-skill decisions --type revert` — finds reverted approaches to avoid
- `git-skill timeline <file>` — reviews history of files that will change
- `git-skill hotspots` — identifies unstable files to approach carefully
- `git-skill coupling <file>` — finds files that always change together

**Output:** Plan file at `docs/plans/YYYY-MM-DD-[feature-name].md` + GitHub issue

**Why history matters:** If someone tried this approach 3 weeks ago and reverted it, the plan should explain why this attempt is different. Without git-skill, Claude would suggest the same failed approach.

## Phase 2: `/implement [plan]`

**What it does:** Implements the plan using TDD with frequent WIP commits.

**Process:**
1. Creates feature branch + draft PR immediately
2. For each task: write failing test → implement → refactor
3. Commits and pushes WIP frequently (rollback/backup points)
4. Stops when implementation is complete

**Why WIP commits:** Creates backup points the team can see. The `/review` phase will soft-reset the last commit to inspect changes before re-committing clean.

## Phase 3: `/review`

**What it does:** Soft-resets the last WIP commit, runs verify on staged changes, then re-commits clean after approval.

**The key flow:**
```
git reset --soft HEAD~1    → WIP commit becomes staged changes
git-skill verify           → checks staged changes against history
[fix issues if needed]     → re-stage fixes
git commit -m "feat: ..."  → clean commit after approval
```

**git-skill integration:**
- `git reset --soft HEAD~1` — unstages the last WIP commit so verify can inspect
- `git-skill verify` — checks staged changes against history
  - **BLOCK**: Change re-introduces a reverted pattern → STOP, ask user
  - **WARN**: File has been churning or relates to a reverted change → proceed with caution
  - **PASS**: No concerns
- `git-skill diff-summary` — summarizes what changed in the branch
- `git-skill hotspots` — flags modified files that are already churning

**Why soft-reset:** `git-skill verify` only works on **staged** changes (`git diff --cached`). By soft-resetting the WIP commit, the changes become staged again for verification. After review passes, they're re-committed with a clean conventional message.

## Phase 4: `/finalize`

**What it does:** Final checks, PR ready for merge.

**git-skill integration:**
- `git-skill verify` — final check
- `git-skill doctor` — health check
- `git-skill hotspots` — show current state

**Output:** PR converted to ready, verification output shown.

## Example Session

```
You: /plan add rate limiting to the chat API

Claude: Let me check git history first...
  git-skill search "rate limit" → Found 2 prior commits
  git-skill decisions --type revert → No reverts related to rate limiting
  git-skill hotspots → chat.py has 209 commits (high churn)

  [Asks 3 clarifying questions]
  [Writes plan to docs/plans/2026-04-02-rate-limiting.md]
  [Creates GitHub issue]
  STOP — waiting for approval

You: looks good, /implement docs/plans/2026-04-02-rate-limiting.md

Claude: [Creates branch, draft PR]
  [TDD cycle for each task]
  [Pushes 6 WIP commits as backup]
  STOP — implementation complete

You: /review

Claude: Soft-resetting last WIP commit for verification...
  git reset --soft HEAD~1

  Running tests... 14/14 passing

  Running git-skill verify on staged changes...
  [PASS] middleware/rate_limit.py — no concerning history
  [WARN] chat.py — modified 209 times, high churn file

  [Fixes 1 major issue, re-stages]
  Re-committing clean: "feat: add rate limiting to chat API"
  STOP — review complete

You: /finalize

Claude: git-skill verify... all PASS
  git-skill doctor... healthy
  PR converted to ready
  STOP — PR #42 ready for merge
```

## Customization

The commands live at `.claude/commands/` in your project:
- `plan.md` — planning phase
- `implement.md` — implementation phase
- `review.md` — code review with verify
- `finalize.md` — finalization

Edit them to match your project's conventions:
- Add project-specific test commands
- Add linter commands
- Add deployment verification steps
- Integrate other tools (supabase-skill, context7-skill, etc.)

git-skill won't overwrite existing commands on re-init — your customizations are safe.

## Setup

```bash
npm install -g @m2015agg/git-skill
git-skill install            # configure embeddings + API key
cd your-project
git-skill init               # installs hooks, commands, indexes history
git-skill enrich             # analyze commit history (optional, improves verify)
```

After init, the four slash commands are available in Claude Code. Start with `/plan`.
