import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

// Validate pinned Docker Hub tags without needing a local Docker daemon.
const compose = parse(
  await readFile(new URL('../../docker-compose.yml', import.meta.url), 'utf8'),
);
const images = new Set(
  Object.values(compose.services)
    .map((service) => service.image)
    .filter((image) => image && !image.startsWith('bee-')),
);
for (const file of [
  'backend.Dockerfile',
  'frontend.Dockerfile',
  'minio-init.Dockerfile',
]) {
  const source = await readFile(
    new URL(`../docker/${file}`, import.meta.url),
    'utf8',
  );
  for (const match of source.matchAll(/^FROM ([\w./-]+:[\w.-]+)/gm))
    images.add(match[1]);
}
let failures = 0;
for (const image of images) {
  const [rawRepository, tag] = image.split(':');
  if (rawRepository.startsWith('quay.io/')) {
    const repository = rawRepository.slice('quay.io/'.length);
    const response = await fetch(
      `https://quay.io/v2/${repository}/manifests/${tag}`,
      { method: 'HEAD' },
    );
    console.log(`${response.status} ${image}`);
    if (!response.ok) failures++;
    continue;
  }
  const repository = rawRepository.includes('/')
    ? rawRepository
    : `library/${rawRepository}`;
  const auth = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,
  );
  if (!auth.ok) throw new Error('Docker Hub authentication unavailable');
  const { token } = await auth.json();
  const response = await fetch(
    `https://registry-1.docker.io/v2/${repository}/manifests/${tag}`,
    {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:
          'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json',
      },
    },
  );
  console.log(`${response.status} ${image}`);
  if (!response.ok) failures++;
}
process.exitCode = failures ? 1 : 0;
