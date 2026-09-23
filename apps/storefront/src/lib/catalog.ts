import { createApiClient, type components } from '@bee/api-client';

export type Product = components['schemas']['Product'];
export type Metadata = components['schemas']['Metadata'];
export const catalogApi = () =>
  createApiClient(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8080');
export const money = (minor: number, locale: string) =>
  new Intl.NumberFormat(locale === 'ro' ? 'ro-MD' : 'ru-MD', {
    style: 'currency',
    currency: 'MDL',
  }).format(minor / 100);
export const catalogText = {
  ru: {
    title: 'Оборудование для вашей пасеки',
    catalog: 'Каталог',
    search: 'Поиск',
    query: 'Название или назначение',
    category: 'Категория',
    brand: 'Бренд',
    all: 'Все',
    sort: 'Сортировка',
    newest: 'Сначала новые',
    price_asc: 'Цена по возрастанию',
    price_desc: 'Цена по убыванию',
    name: 'По названию',
    apply: 'Применить',
    clear: 'Сбросить',
    empty: 'Товары не найдены. Попробуйте изменить условия поиска.',
    unavailable:
      'Каталог временно недоступен. Попробуйте обновить страницу позже.',
    previous: 'Назад',
    next: 'Далее',
    from: 'от',
    found: 'Найдено товаров',
    min: 'Цена от, MDL',
    max: 'Цена до, MDL',
    description: 'Описание',
    variants: 'Варианты и характеристики',
    sku: 'Артикул',
    price: 'Цена',
    noImage: 'Фото готовится',
    orderNotice:
      'Онлайн-заказы пока недоступны. Каталог находится на этапе подготовки.',
    back: 'Вернуться в каталог',
    missing: 'Товар не найден',
  },
  ro: {
    title: 'Echipamente pentru stupina ta',
    catalog: 'Catalog',
    search: 'Căutare',
    query: 'Denumire sau utilizare',
    category: 'Categorie',
    brand: 'Marcă',
    all: 'Toate',
    sort: 'Sortare',
    newest: 'Cele mai noi',
    price_asc: 'Preț crescător',
    price_desc: 'Preț descrescător',
    name: 'După denumire',
    apply: 'Aplică',
    clear: 'Resetează',
    empty: 'Nu am găsit produse. Încearcă alte filtre.',
    unavailable:
      'Catalogul nu este disponibil momentan. Reîncearcă mai târziu.',
    previous: 'Înapoi',
    next: 'Înainte',
    from: 'de la',
    found: 'Produse găsite',
    min: 'Preț de la, MDL',
    max: 'Preț până la, MDL',
    description: 'Descriere',
    variants: 'Variante și caracteristici',
    sku: 'Cod produs',
    price: 'Preț',
    noImage: 'Fotografie în pregătire',
    orderNotice:
      'Comenzile online nu sunt încă disponibile. Catalogul este în pregătire.',
    back: 'Înapoi la catalog',
    missing: 'Produsul nu a fost găsit',
  },
} as const;
