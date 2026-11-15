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
