// Runs a coding agent on a GitHub issue in the background, without manual steps:
// creates the worktree, writes the standard prompt, starts OpenCode, Kilo or Antigravity
// headless and moves on to the next model when one runs out of quota or stops responding.
//
//   npm run agent:ready                    issues an agent can take right now
//   npm run agent:run -- <issue> [--tool opencode|kilo|agy] [--model <id>] [--agent <role>]
//                       [--base <branch>]        start from an unmerged branch instead of main
//                       [--review-file <file>]   send review findings back to the agent
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

// One queue mixing all three tools. Each issue starts at a different place in it, so
// parallel agents use different tools and quotas. Coarena models need COARENA_API_KEY.
const allRunners = [
  ['opencode', 'coarena/gpt-6-luna'],
  ['agy', 'claude-sonnet-4-6'],
  ['kilo', 'kilo/nvidia/nemotron-3-ultra-550b-a55b:free'],
  ['opencode', 'coarena/gemini-3-8-flash'],
  ['agy', 'gemini-3.8-flash-high'],
  ['kilo', 'coarena/deepseek-v4-1-flash-1017'],
  ['opencode', 'opencode/deepseek-v4.1-flash-free'],
  ['kilo', 'kilo/cohere/north-mini-code:free'],
  ['opencode', 'opencode/glm-5.3-flash-free'],
  ['kilo', 'kilo/kilo-auto/free'],
  ['opencode', 'opencode/mimo-v2.6-flash-free'],
];
// Coarena allows at most 2 requests at once, so at most 2 agents use it at a time.
const coarenaSlots = 2;
// Antigravity gets the same access as OpenCode, for its own runs only: any command,
// file writes inside the worktree.
const agySettings = JSON.stringify({
  permissions: { allow: ['command(*)', 'read_file(.)', 'write_file(.)'] },
});
const quotaPattern =
  /free usage limit|rate limit|too many requests|quota|resource.exhausted|insufficient (credits|balance)|payment required|credit limit|sign up for free|come back later/i;
const idleLimitMs = 15 * 60 * 1000;
const isWindows = process.platform === 'win32';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const agentsDir = path.join(
  path.dirname(repoRoot),
  `${path.basename(repoRoot)}-agents`,
);
const logsDir = path.join(agentsDir, 'logs');

const gh = (args) =>
  JSON.parse(execFileSync('gh', args, { cwd: repoRoot, encoding: 'utf8' }));

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');

const dependencies = (body) =>
  [...(body.match(/^Depends on (.+)$/m)?.[1].matchAll(/#(\d+)/g) ?? [])].map(
    ([, number]) => Number(number),
  );

const openPullRequests = () =>
  gh(['pr', 'list', '--state', 'open', '--json', 'body,headRefName']);

const isTaken = (number, pullRequests) =>
  pullRequests.some(
    ({ body, headRefName }) =>
      headRefName.startsWith(`agent/${number}-`) ||
      new RegExp(`(close|closes|fix|fixes) #${number}\\b`, 'i').test(body),
  ) ||
  execFileSync('git', ['worktree', 'list'], { encoding: 'utf8' }).includes(
    `[agent/${number}-`,
  );

const blockers = (body) =>
  dependencies(body).filter(
    (number) =>
      gh(['issue', 'view', String(number), '--json', 'state']).state === 'OPEN',
  );

const listReady = () => {
  const pullRequests = openPullRequests();
  const issues = gh([
    'issue',
    'list',
    '--label',
    'agent-ready',
    '--state',
    'open',
    '--json',
    'number,title,body',
  ]);

  for (const { number, title, body } of issues.reverse()) {
    const blockedBy = blockers(body);
    const status = isTaken(number, pullRequests)
      ? 'taken'
      : blockedBy.length
        ? `waits for ${blockedBy.map((n) => `#${n}`).join(', ')}`
        : 'ready';
    console.log(`#${number}\t${status}\t${title}`);
  }
};

const promptFor = (
  number,
  title,
  branch,
  base,
) => `You are an autonomous coding agent working on GitHub issue #${number} ("${title}") of this repository, inside your own git worktree on branch ${branch}.

1. Read AGENTS.md and run \`gh issue view ${number}\`.
2. If \`git status\` shows uncommitted changes or the branch already has commits ahead of , a previous agent started this task: continue from that work, do not start over.
3. Implement the issue exactly within its scope. Work without asking questions; if you are truly blocked, comment on the issue with \`gh issue comment ${number}\` and stop.
4. Keep every file you create inside this folder. Temporary files go to .tmp/ and must be deleted before you finish (leave .tmp/agent-prompt*.md alone).
5. Run \`npm run format\`; \`npm run verify\` must pass.
6. Commit in small Conventional Commits on this branch (for example \`test(db): ...\`, \`docs: ...\`). Do NOT push and do NOT open a pull request: the owner does that.
7. End with the handoff summary from AGENTS.md.
`;

// Kilo and Antigravity do not load the project's opencode.json roles, so the role
// description is pasted into their prompt.
const rolePromptFor = (cwd, role, prompt) =>
  `${readFileSync(path.join(cwd, `.github/agents/${role}.agent.md`), 'utf8')}\n` +
  prompt;

// Prompt files live in the worktree (tools may not read outside it), in .tmp/, which is
// excluded from git for every worktree through the shared info/exclude file.
const writePrompts = (cwd, prompt, rolePrompt) => {
  const commonDir = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd, encoding: 'utf8' },
  ).trim();
  const exclude = path.join(commonDir, 'info', 'exclude');
  mkdirSync(path.dirname(exclude), { recursive: true });
  if (
    !existsSync(exclude) ||
    !/^\.tmp\/$/m.test(readFileSync(exclude, 'utf8'))
  ) {
    appendFileSync(exclude, '\n.tmp/\n');
  }

  const tmpDir = path.join(cwd, '.tmp');
  mkdirSync(tmpDir, { recursive: true });
  const promptFile = path.join(tmpDir, 'agent-prompt.md');
  const rolePromptFile = path.join(tmpDir, 'agent-prompt-role.md');
  writeFileSync(promptFile, prompt);
  writeFileSync(rolePromptFile, rolePrompt);
  return { promptFile, rolePromptFile };
};

const commandFor = ({ tool, model, role, cwd, title, prompts }) => {
  if (tool === 'agy') {
    return {
      command: 'agy',
      // stream-json keeps output flowing, so the idle watchdog sees the agent working.
      args: [
        '-p',
        readFileSync(prompts.rolePromptFile, 'utf8'),
        '--model',
        model,
        '--mode',
        'accept-edits',
        '--settings',
        agySettings,
        '--output-format',
        'stream-json',
      ],
      // agy is a real executable, so it starts without a shell and the multi-line
      // prompt is passed as is.
      shell: false,
    };
  }

  // The message goes first: --file takes every following argument as another file.
  // Kilo runs --pure: its indexing plugin otherwise keeps the process alive after the answer.
  const args = [
    'run',
    'Follow the instructions in the attached file.',
    ...(tool === 'kilo' ? ['--pure'] : []),
    '--agent',
    tool === 'kilo' ? 'code' : role,
    '--model',
    model,
    '--title',
    title,
    '--file',
    tool === 'kilo' ? prompts.rolePromptFile : prompts.promptFile,
    '--dir',
    cwd,
  ];
  // The OpenCode and Kilo commands are npm shims on Windows, which need a shell.
  return {
    command: tool,
    args: args.map((arg) =>
      isWindows && arg.includes(' ') ? `"${arg}"` : arg,
    ),
    shell: isWindows,
  };
};

const stopProcess = (child) => {
  if (isWindows) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
      });
    } catch {
      // The agent exited on its own between the check and the kill: nothing to stop.
    }
  } else {
    child.kill('SIGTERM');
  }
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// One lock file per Coarena slot, holding the pid of the launcher that uses it.
const acquireCoarenaSlot = () => {
  mkdirSync(logsDir, { recursive: true });
  for (let slot = 1; slot <= coarenaSlots; slot += 1) {
    const lock = path.join(logsDir, `coarena-slot-${slot}.lock`);
    if (existsSync(lock)) {
      if (isAlive(Number(readFileSync(lock, 'utf8')))) continue;
      rmSync(lock, { force: true });
    }
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return () => rmSync(lock, { force: true });
    } catch {
      continue;
    }
  }
  return null;
};

// Resolves 'done' on a normal exit, 'switch' when the model ran out of quota or hung,
// 'error' when the agent could not work at all.
const runOnce = (run) =>
  new Promise((resolve) => {
    const { tool, model, role, cwd, logFile } = run;
    const release = model.startsWith('coarena/')
      ? acquireCoarenaSlot()
      : () => {};
    if (!release) {
      console.log(
        `Coarena already serves ${coarenaSlots} agents, skipping it.`,
      );
      resolve('switch');
      return;
    }

    appendFileSync(
      logFile,
      `\n=== ${tool} ${model} (${role}) ${new Date().toISOString()}\n`,
    );
    const startSize = statSync(logFile).size;
    const { command, args, shell } = commandFor(run);
    const child = spawn(command, args, {
      cwd,
      // npm passes the main checkout as PWD, and the CLIs trust PWD over the real cwd.
      env: { ...process.env, PWD: cwd },
      shell,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let lastOutput = Date.now();
    let switching = false;

    const append = (chunk) => {
      lastOutput = Date.now();
      appendFileSync(logFile, chunk);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const watchdog = setInterval(() => {
      const output = readFileSync(logFile, 'utf8').slice(startSize);
      const outOfQuota = quotaPattern.test(output);
      const idle = Date.now() - lastOutput > idleLimitMs;
      if (outOfQuota || idle) {
        switching = true;
        append(
          `\n=== ${outOfQuota ? 'quota exhausted' : 'no output for 15 min'}, switching model\n`,
        );
        stopProcess(child);
      }
    }, 10_000);

    child.on('exit', () => {
      clearInterval(watchdog);
      release();
      const output = readFileSync(logFile, 'utf8').slice(startSize);
      if (switching || quotaPattern.test(output)) resolve('switch');
      // A run that only printed an error, or was refused access to its own files, did not
      // really work: other models would fail the same way.
      else if (
        /auto-rejecting|auto-denied/.test(output) ||
        (/Error:/.test(output) && output.length < 2000)
      )
        resolve('error');
      else resolve('done');
    });
  });

const runIssue = async (number, options) => {
  const issue = gh([
    'issue',
    'view',
    String(number),
    '--json',
    'title,body,state',
  ]);
  if (issue.state !== 'OPEN') fail(`#${number} is closed.`);

  const blockedBy = blockers(issue.body);
  if (blockedBy.length) {
    fail(`#${number} waits for ${blockedBy.map((n) => `#${n}`).join(', ')}.`);
  }

  // Reuse the issue's worktree if an earlier run created one, so no work is lost.
  const existing = existsSync(agentsDir)
    ? readdirSync(agentsDir).find((name) => name.startsWith(`${number}-`))
    : undefined;
  const task = existing ?? `${number}-${slugify(issue.title)}`;
  const cwd = path.join(agentsDir, task);
  if (!existsSync(cwd)) {
    execFileSync('git', ['fetch', 'origin', options.base], {
      stdio: 'inherit',
    });
    execFileSync(
      'node',
      [
        path.join(repoRoot, 'infra/scripts/agent-worktree.mjs'),
        'new',
        task,
        '--from',
        `origin/${options.base}`,
      ],
      { stdio: 'inherit' },
    );
  }

  const role =
    options.agent ??
    issue.body.match(/### Starting role\s+(\w[\w-]*)/)?.[1] ??
    'developer';

  mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${task}.log`);
  const prompt =
    promptFor(number, issue.title, `agent/${task}`, `origin/${options.base}`) +
    (options.review
      ? `\n## Review findings to fix\n\nThe owner reviewed your work on this branch. Fix exactly these points, commit, and report what you changed:\n\n${options.review}\n`
      : '');
  const prompts = writePrompts(cwd, prompt, rolePromptFor(cwd, role, prompt));

  const runners = allRunners.filter(
    ([, model]) => process.env.COARENA_API_KEY || !model.startsWith('coarena/'),
  );
  const shift = number % runners.length;
  const rotated = [...runners.slice(shift), ...runners.slice(0, shift)];
  const queue = options.tool
    ? [
        [
          options.tool,
          options.model ??
            rotated.find(([tool]) => tool === options.tool)?.[1] ??
            fail(`No model known for ${options.tool}.`),
        ],
      ]
    : rotated;

  console.log(`#${number} → ${cwd}\nLog: ${logFile}`);

  // HEAD plus uncommitted changes: if neither moves, the agent did nothing.
  const snapshot = () =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }) +
    execFileSync('git', ['status', '--short'], { cwd, encoding: 'utf8' });

  for (const [tool, model] of queue) {
    console.log(`Running ${tool} ${model} as ${role}…`);
    const before = snapshot();
    const result = await runOnce({
      tool,
      model,
      role,
      cwd,
      logFile,
      title: `Issue #${number}`,
      prompts,
    });
    if (result === 'done' && snapshot() === before) {
      console.log(
        `${tool} ${model} finished without changing anything, trying the next model.`,
      );
      continue;
    }
    if (result === 'done') {
      const commits = execFileSync(
        'git',
        ['log', '--oneline', `origin/${options.base}..HEAD`],
        { cwd, encoding: 'utf8' },
      );
      const dirty = execFileSync('git', ['status', '--short'], {
        cwd,
        encoding: 'utf8',
      });
      console.log(
        `Finished with ${tool} ${model}.\nCommits:\n${commits || '(none)\n'}` +
          (dirty ? `Uncommitted changes:\n${dirty}` : 'Working tree clean.'),
      );
      return;
    }
    if (result === 'error') {
      fail(`${tool} ${model} could not work. See the log: ${logFile}`);
    }
    console.log(
      `${tool} ${model} ran out of quota or stalled, trying the next model.`,
    );
  }

  fail(
    'All models are exhausted for now. The work so far stays in the worktree.',
  );
};

const [command, ...rest] = process.argv.slice(2);
const option = (name) => {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
};

if (command === 'ready') {
  listReady();
} else if (command === 'run' && Number(rest[0])) {
  await runIssue(Number(rest[0]), {
    tool: option('tool'),
    model: option('model'),
    agent: option('agent'),
    // A branch the new worktree starts from instead of main, for example a
    // pull request the task builds on that is not merged yet.
    base: option('base') ?? 'main',
    review: option('review-file')
      ? readFileSync(option('review-file'), 'utf8')
      : option('review'),
  });
} else {
  fail(
    'Usage:\n' +
      '  npm run agent:ready\n' +
      '  npm run agent:run -- <issue> [--tool opencode|kilo|agy] [--model <id>] [--agent <role>] [--base <branch>] [--review-file <file>]',
  );
}
