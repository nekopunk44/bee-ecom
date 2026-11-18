# Bee working instructions

- Follow the architecture and milestone plan in `docs/architecture/` and the ADRs.
- Commits are spread across calendar days as the owner's global rules require: 7–15
  commits per day, the count for each day is rolled at random (`shuf -i 7-15 -n 1`);
  once a day is full, continue on the next day. Set both `GIT_AUTHOR_DATE` and
  `GIT_COMMITTER_DATE` (+0300, times from morning to evening). Never rewrite commits
  that are already pushed. Split work into coherent, reviewable commits; no empty
  commits or invented work.
- Report a missed target or lack of real work honestly. This rule does not create
  a scheduler and cannot ensure activity while the agent is not running.
- Local commits and GitHub pushes are different. Never claim a commit is on
  GitHub unless the remote reference has been verified. Do not invent a remote
  repository or publish to an unrelated existing repository.
- The user explicitly declined installing Linux/WSL/Docker on 2026-09-23. Use
  existing tools and available checks; label unexecuted C++/container checks.
- Never commit `.env`, credentials, generated local uploads or test artifacts.

## Agent tasks

Small, self-contained tasks go to free AI agents through GitHub issues labeled
`agent-ready` (template `.github/ISSUE_TEMPLATE/agent-task.yml`). The owner keeps the
storefront, the admin and larger features.

```sh
gh issue list --label agent-ready   # available tasks
npm run agent:ready                 # which of them can start now
npm run agent:run -- <issue>        # run an agent on one issue in the background
```

- One issue = one worktree = one branch = one pull request. `agent:run` creates the
  worktree in `../Bee-agents/<number>-<slug>` on branch `agent/<number>-<slug>`.
- An issue that starts with `Depends on #N` waits until issue `#N` is closed.
- Roles live in `.github/agents/`: `developer` implements, `qa` reviews without editing.
- Treat the acceptance criteria as the definition of done. If they are ambiguous, comment
  on the issue with `gh issue comment` and stop instead of guessing.
- Stay inside your worktree. Temporary files go to `.tmp/` and are deleted when done.
- Run `npm run format`, then `npm run verify`; it must pass before every commit.
- Agents commit with the current date and never push or open pull requests: the owner
  spreads the commit dates, pushes and opens the pull request. Do not change `user.name`
  or `user.email`, and add no `Co-Authored-By` or other AI attribution.
- Never reset or overwrite someone else's changes. If the task needs a file another open
  `agent/*` branch changes, stop and report it.
- Finish with a handoff summary: task, files changed, checks run with results, known
  limitations.
