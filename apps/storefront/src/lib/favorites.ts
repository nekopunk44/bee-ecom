/**
 * Избранное хранится в браузере, в cookie: так сервер сразу рисует закрашенные
 * сердечки, число в шапке и страницу избранного, а вход в аккаунт не нужен.
 * Список — адреса товаров через запятую, последний добавленный первым.
 */
export const FAVORITES_COOKIE = 'bee_favorites';
/** Около 60 адресов умещаются в cookie (до 4 КБ) с запасом. */
export const FAVORITES_LIMIT = 60;
const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/;

export function parseFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // Испорченное значение: читаем как есть, лишнее отсеет проверка адреса.
  }
  return [...new Set(text.split(',').filter((slug) => SLUG.test(slug)))].slice(
    0,
    FAVORITES_LIMIT,
  );
}

export function readFavorites(): string[] {
  const prefix = `${FAVORITES_COOKIE}=`;
  const entry = document.cookie
    .split('; ')
    .find((part) => part.startsWith(prefix));
  return parseFavorites(entry?.slice(prefix.length));
}

function writeFavorites(slugs: string[]) {
  const kept = slugs.slice(0, FAVORITES_LIMIT);
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${FAVORITES_COOKIE}=${encodeURIComponent(kept.join(','))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.dispatchEvent(
    new CustomEvent('bee:favorites', { detail: kept.length }),
  );
}

/** Добавляет товар в избранное или убирает его. Возвращает, сохранён ли он теперь. */
export function toggleFavorite(slug: string): boolean {
  const current = readFavorites();
  const saved = current.includes(slug);
  writeFavorites(
    saved ? current.filter((item) => item !== slug) : [slug, ...current],
  );
  return !saved;
}
