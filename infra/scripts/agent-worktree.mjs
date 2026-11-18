// Gives every agent its own working copy (git worktree) and branch,
// so parallel agents never edit the same files on disk.
//
//   npm run agent:new -- <task> [--from <branch>]
//   npm run agent:remove -- <task>
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [command, task, ...rest] = process.argv.slice(2);

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', ...options });

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!['new', 'remove'].includes(command) || !task) {
  fail(
    'Usage:\n' +
      '  npm run agent:new -- <task> [--from <branch>]\n' +
      '  npm run agent:remove -- <task>',
  );
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(task)) {
  fail('Task name must be kebab-case: lowercase letters, digits and dashes.');
}

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const worktreePath = path.join(
  path.dirname(repoRoot),
  `${path.basename(repoRoot)}-agents`,
  task,
);
const branch = `agent/${task}`;

if (command === 'new') {
  const fromIndex = rest.indexOf('--from');
  const base = fromIndex === -1 ? 'main' : rest[fromIndex + 1];

  if (!base) fail('--from needs a branch name.');
  if (existsSync(worktreePath)) fail(`Already exists: ${worktreePath}`);

  run('git', ['worktree', 'add', '-b', branch, worktreePath, base]);
  run('npm', ['ci'], {
    cwd: worktreePath,
    shell: process.platform === 'win32',
  });

  console.log(
    `\nReady. Branch: ${branch}\nOpen the agent in: ${worktreePath}\n` +
      `When finished: npm run verify, commit, push, open a PR into ${base}.`,
  );
}

if (command === 'remove') {
  if (!existsSync(worktreePath)) fail(`No worktree at ${worktreePath}`);

  run('git', ['worktree', 'remove', worktreePath]);

  try {
    run('git', ['branch', '-d', branch]);
  } catch {
    console.log(
      `Branch ${branch} is not merged yet, so it was kept. ` +
        `Delete it manually once you no longer need it.`,
    );
  }
}
