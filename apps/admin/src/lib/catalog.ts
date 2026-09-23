import { createApiClient, type components } from '@bee/api-client';
export const api = createApiClient();
export type Product = components['schemas']['Product'];
export type Draft = components['schemas']['ProductDraft'];
export type Metadata = components['schemas']['Metadata'];
export type Session = components['schemas']['Session'];
export const emptyDraft = (): Draft => ({
  slug: '',
  status: 'draft',
  brandId: null,
  categoryIds: [],
  mediaIds: [],
  translations: {
    ru: { name: '', description: '', seoTitle: '', seoDescription: '' },
    ro: { name: '', description: '', seoTitle: '', seoDescription: '' },
  },
  variants: [
    { sku: '', name: 'Основной', priceMinor: 0, active: true, attributes: {} },
  ],
});
export function draftOf(product: Product): Draft {
  return {
    slug: product.slug,
    status: product.status,
    brandId: product.brandId,
    categoryIds: [...product.categoryIds],
    mediaIds: product.images.map((image) => image.id),
    translations: {
      ru: { ...product.translations.ru },
      ro: { ...product.translations.ro },
    },
    variants: product.variants.map(({ currency: _, ...variant }) => ({
      ...variant,
      attributes: { ...variant.attributes },
    })),
  };
}
export function errorText(code?: string) {
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Сессия истекла. Войдите снова; введённые данные сохранены в форме.';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия.';
    case 'ORIGIN_REJECTED':
      return 'Адрес админки не совпадает с ADMIN_ORIGIN в настройках API.';
    case 'REVISION_CONFLICT':
      return 'Товар изменён другим сотрудником. Скопируйте нужные изменения и откройте актуальную версию.';
    case 'DUPLICATE_SLUG_OR_SKU':
      return 'Такой адрес товара или артикул уже существует.';
    case 'INVALID_REFERENCE':
      return 'Проверьте категории, бренд, атрибуты и изображения.';
    case 'RATE_LIMITED':
      return 'Слишком много попыток входа. Попробуйте через 15 минут.';
    case 'INVALID_CREDENTIALS':
      return 'Проверьте адрес почты и пароль.';
    case 'INVALID_IMAGE':
    case 'IMAGE_TOO_LARGE':
      return 'Нужен JPEG, PNG или WebP до 8 МБ и 40 мегапикселей.';
    case 'REFERENCE_CONFLICT':
      return 'Проверьте уникальность кода или адреса справочника.';
    default:
      return 'Не удалось завершить действие. Проверьте данные и подключение. Перед повторной записью обновите список.';
  }
}
