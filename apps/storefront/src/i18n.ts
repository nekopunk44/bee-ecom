export const locales = ['ru', 'ro'] as const;
export type Locale = (typeof locales)[number];

export const messages = {
  ru: {
    title: 'Bee — оборудование для современной пасеки',
    description:
      'Оборудование для пчеловодства в Молдове. Готовим новый магазин Bee.',
    skip: 'Перейти к содержимому',
    locale: 'Язык сайта',
    label: 'Современная пасека в Молдове',
    heading: 'Хорошая пасека начинается с правильных вещей.',
    intro:
      'Продуманное оборудование. Совместимые системы. Всё, что помогает заботиться о пчёлах и развивать своё дело.',
    notice:
      'Выбирайте в каталоге, складывайте в корзину и оформляйте заказ с оплатой при получении.',
    open: 'Открыть каталог',
    popular: 'Часто ищут',
    queries: ['Дадан', 'Рута', 'Лежак', 'Медогонка'],
    art: 'Улей в медовых сотах',
    catalog: 'Каталог',
    all: 'Все товары',
    fresh: 'Новое в каталоге',
    freshNote: 'Последние товары, добавленные в каталог.',
    find: 'Знаете, что нужно? Найдём по названию',
    findText:
      'Ищите по названию, системе улья или назначению: «рамка 435», «дымарь», «вощина».',
    findLabel: 'Что ищете',
    findButton: 'Найти',
    facts: [
      {
        title: 'На русском и румынском',
        text: 'Каталог и описания товаров на обоих языках.',
      },
      {
        title: 'Корзина в аккаунте',
        text: 'Отложенные товары сохраняются и открываются с любого устройства.',
      },
      {
        title: 'Оплата при получении',
        text: 'Курьер, самовывоз со склада или почта по Молдове — платите, когда заказ у вас.',
      },
    ],
    footer: 'Для тех, кто создаёт свою пасеку.',
  },
  ro: {
    title: 'Bee — echipamente pentru stupina modernă',
    description: 'Echipamente apicole în Moldova. Pregătim noul magazin Bee.',
    skip: 'Salt la conținut',
    locale: 'Limba site-ului',
    label: 'Stupina modernă în Moldova',
    heading: 'O stupină bună începe cu alegerile potrivite.',
    intro:
      'Echipamente bine gândite. Sisteme compatibile. Tot ce te ajută să îngrijești albinele și să îți dezvolți afacerea.',
    notice:
      'Alege din catalog, adaugă în coș și plasează comanda cu plata la primire.',
    open: 'Deschide catalogul',
    popular: 'Căutări frecvente',
    queries: ['Dadant', 'Langstroth', 'Stup orizontal', 'Extractor'],
    art: 'Stup în faguri de miere',
    catalog: 'Catalog',
    all: 'Toate produsele',
    fresh: 'Noutăți în catalog',
    freshNote: 'Cele mai noi produse adăugate în catalog.',
    find: 'Știi ce îți trebuie? Căutăm după denumire',
    findText:
      'Caută după denumire, tipul stupului sau utilizare: „ramă 435”, „afumător”, „fagure artificial”.',
    findLabel: 'Ce cauți',
    findButton: 'Caută',
    facts: [
      {
        title: 'În română și rusă',
        text: 'Catalogul și descrierile produselor în ambele limbi.',
      },
      {
        title: 'Coșul în cont',
        text: 'Produsele puse deoparte se păstrează și se deschid de pe orice dispozitiv.',
      },
      {
        title: 'Plata la primire',
        text: 'Curier, ridicare din depozit sau poștă în Moldova — plătești când comanda ajunge la tine.',
      },
    ],
    footer: 'Pentru cei care își construiesc propria stupină.',
  },
} satisfies Record<Locale, object>;

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}
