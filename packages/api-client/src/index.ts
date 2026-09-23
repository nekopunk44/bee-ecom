import createClient from 'openapi-fetch';
import type { paths } from './schema';

/** Browser callers use same-origin /api/v1; SSR supplies an internal origin. */
export function createApiClient(baseUrl = '') {
  return createClient<paths>({ baseUrl, credentials: 'same-origin' });
}

export type { components, paths } from './schema';
