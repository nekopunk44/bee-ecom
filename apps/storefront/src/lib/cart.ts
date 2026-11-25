import { createApiClient } from '@bee/api-client';
import type { Locale } from '../i18n';

export type AddResult = 'added' | 'login' | 'limit' | 'failed';

/**
 * Кладёт в корзину ещё одну штуку варианта. API задаёт количество, а не прибавляет:
 * сначала берём то, что уже лежит в корзине, и добавляем одну. Корзина есть только
 * у вошедшего покупателя, поэтому 401 означает «нужно войти».
 */
export async function addOne(
  variantId: string,
  locale: Locale,
): Promise<AddResult> {
  const api = createApiClient();
  try {
    const current = await api.GET('/api/v1/cart', {
      params: { query: { locale } },
      signal: AbortSignal.timeout(10000),
    });
    if (current.error)
      return current.response.status === 401 ? 'login' : 'failed';
    const inCart =
      current.data.items.find((item) => item.variantId === variantId)
        ?.quantity ?? 0;
    if (inCart >= 100) return 'limit';
    const result = await api.POST('/api/v1/cart/items', {
      params: { query: { locale } },
      body: { variantId, quantity: inCart + 1 },
      signal: AbortSignal.timeout(10000),
    });
    if (result.error)
      return result.response.status === 401 ? 'login' : 'failed';
    return 'added';
  } catch {
    return 'failed';
  }
}
