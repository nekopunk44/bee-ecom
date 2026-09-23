# Bee working instructions

- Follow the architecture and milestone plan in `docs/architecture/` and the ADRs.
- The user's daily commit target is **9–15 meaningful commits every calendar
  day**, with no empty days. Count days in `Europe/Chisinau`.
- During active authorized implementation, split work into coherent, reviewable
  commits and check the day's existing count before committing. Do not use empty
  commits, invented work, backdated timestamps or history rewrites to meet a quota.
- Report a missed target or lack of real work honestly. This rule does not create
  a scheduler and cannot ensure activity while the agent is not running.
- Local commits and GitHub pushes are different. Never claim a commit is on
  GitHub unless the remote reference has been verified. Do not invent a remote
  repository or publish to an unrelated existing repository.
- The user explicitly declined installing Linux/WSL/Docker on 2026-09-23. Use
  existing tools and available checks; label unexecuted C++/container checks.
- Never commit `.env`, credentials, generated local uploads or test artifacts.
