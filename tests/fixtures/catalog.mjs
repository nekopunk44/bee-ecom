// Test data only. Never imported by either production application.
// Фото — цветные квадраты в data:, их пропускает CSP витрины и не нужно хранилище.
const picture = (id, color) => ({
  id,
  url: `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/></svg>`,
  ).toString('base64')}`,
  srcSet: '',
});
export const category = '11111111-1111-4111-8111-111111111111';
export const brand = '44444444-4444-4444-8444-444444444444';
export const metadata = {
  categories: [{ id: category, slug: 'hives', name: 'Ульи' }],
  brands: [{ id: brand, slug: 'apilemn', name: 'ApiLemn' }],
  attributes: [{ code: 'frames', name: 'Количество рамок', unit: 'шт.' }],
};
export const product = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'uley-dadan',
  status: 'active',
  revision: 1,
  brandId: null,
  categoryIds: [category],
  translations: {
    ru: {
      name: 'Улей Дадан 10 рамок',
      description: 'Корпус из дерева.\nДля рамок 435 × 300 мм.',
      seoTitle: 'Улей Дадан — каталог',
      seoDescription: 'Деревянный улей',
    },
    ro: {
      name: 'Stup Dadant 10 rame',
      description: 'Corp din lemn pentru rame 435 × 300 mm.',
      seoTitle: 'Stup Dadant — catalog',
      seoDescription: 'Stup din lemn',
    },
  },
  variants: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      sku: 'DADAN-10',
      name: '10 рамок',
      priceMinor: 125050,
      currency: 'MDL',
      active: true,
      attributes: { frames: '10' },
    },
  ],
  images: [
    picture('55555555-5555-4555-8555-555555555551', '#f5b700'),
    picture('55555555-5555-4555-8555-555555555552', '#17150f'),
    picture('55555555-5555-4555-8555-555555555553', '#b42318'),
  ],
};
// Второй товар каталога: два варианта, поэтому в карточке открывается выбор.
export const hive = {
  ...product,
  id: '66666666-6666-4666-8666-666666666666',
  slug: 'uley-lezhak',
  translations: {
    ru: { ...product.translations.ru, name: 'Улей-лежак на 20 рамок' },
    ro: {
      ...product.translations.ro,
      name: 'Stup orizontal pentru 20 de rame',
    },
  },
  variants: [
    {
      ...product.variants[0],
      id: '77777777-7777-4777-8777-777777777771',
      sku: 'LEZHAK-RAW',
      name: 'Без окраски',
      priceMinor: 300000,
    },
    {
      ...product.variants[0],
      id: '77777777-7777-4777-8777-777777777772',
      sku: 'LEZHAK-PNT',
      name: 'Окрашенный',
      priceMinor: 320000,
    },
  ],
  images: [],
};
// Фасеты как у настоящего API: цены в банях, 24 корзины по логарифмической шкале.
export const facets = {
  categories: [{ id: category, count: 1 }],
  brands: [{ id: brand, count: 1 }],
  price: {
    min: 1700,
    max: 279000,
    histogram: [
      2, 1, 0, 1, 2, 0, 1, 1, 0, 2, 1, 0, 1, 0, 2, 1, 1, 0, 0, 1, 0, 0, 1, 1,
    ],
  },
};
