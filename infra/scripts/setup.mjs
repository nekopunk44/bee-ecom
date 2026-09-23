import { randomBytes } from 'node:crypto';
import { readFile, writeFile, appendFile } from 'node:fs/promises';

const template = await readFile(
  new URL('../../.env.example', import.meta.url),
  'utf8',
);
const content = template.replaceAll('replace-with-random-value', () =>
  randomBytes(32).toString('hex'),
);
try {
  await writeFile(new URL('../../.env', import.meta.url), content, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Created .env with random local credentials. Do not commit it.');
} catch (error) {
  if (error.code === 'EEXIST') {
    const location = new URL('../../.env', import.meta.url);
    const current = await readFile(location, 'utf8');
    const keys = new Set(
      [...current.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]),
    );
    const missing = content
      .split('\n')
      .filter(
        (line) => /^[A-Z0-9_]+=/.test(line) && !keys.has(line.split('=')[0]),
      );
    if (missing.length)
      await appendFile(location, '\n' + missing.join('\n') + '\n');
    console.log(
      `Preserved existing settings; added ${missing.length} missing configuration keys.`,
    );
  } else throw error;
}
