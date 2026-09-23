// Test data only. Never imported by either production application.
export const category = '11111111-1111-4111-8111-111111111111';
export const metadata = {
  categories: [{ id: category, slug: 'hives', name: 'Ульи' }],
  brands: [],
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
  images: [],
};
