---
name: merge-agent-branch
description: Bring a finished subagent worktree branch into the site branch claude/specplast16-setup-7rjxvw, resolve conflicts, clean the worktree, check and push.
---

1. `git merge --no-edit <branch>`; on conflicts keep both sides. In `globals.css` keep both blocks and check the brace at the seam.
2. Remove the worktree and its branches — leftover worktrees break lint:
   `git worktree remove -f -f .claude/worktrees/<agent-dir> && git branch -D worktree-<agent-dir> <branch>`
3. Grep the merged work for rules the owner set:
   - no «СП16»/«SP16» in visible text (brand is always «СпецПласт16»; internal ids like `sp16_*` are fine);
   - machinery is only ever СпецПласт16; no links to other websites; no supplier names or markup shown;
   - prices come from `MACHINE_WORKS`, `HAMMER_RATE`, `CRANE_HEAVY_RATE` — never hard-coded.
4. Run the `site-check` skill, look at screenshots of the new screens on the phone size, then commit the fixes and
   `git fetch origin main && git merge origin/main && git push -u origin claude/specplast16-setup-7rjxvw`.
5. Vercel preview builds share the production database: a branch whose Prisma schema lacks columns another
   merged PR added fails in ~20 s. Merge main first; never add DB tables/columns from this branch without need.
