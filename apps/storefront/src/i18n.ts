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
    parts: [
      { name: 'Дно', detail: 'с летком' },
      { name: 'Корпус', detail: 'рамка 435×300' },
      { name: 'Магазин', detail: 'рамка 435×145' },
      { name: 'Потолок', detail: 'для подкормки' },
      { name: 'Крыша', detail: 'с жестяным верхом' },
    ],
    systems: {
      label: 'Совместимые системы',
      title: 'Корпуса, магазины и рамки, которые подходят друг к другу',
      text: 'Дадан, Рута, Лежак: ищите детали по системе улья и размеру рамки, например «435×300».',
      link: 'Детали для Дадана',
      query: 'Дадан',
      model: 'На модели',
      list: [
        {
          name: 'Дадан',
          query: 'Дадан',
          lines: ['Корпус 435×300', 'Магазин 435×145'],
          model: true,
        },
        {
          name: 'Рута',
          query: 'Рута',
          lines: ['Корпус 435×230', 'Магазин 435×145'],
          model: false,
        },
        {
          name: 'Лежак',
          query: 'Лежак',
          lines: ['20–24 рамки 435×300', 'Без магазинов'],
          model: false,
        },
      ],
    },
    frames: {
      label: 'Рамки и вощина',
      title: 'Сезон начинается с рамки',
      text: 'Рамки, вощина, проволока и всё, чтобы пчёлам было где строить соты и куда носить мёд.',
      link: 'Рамки и вощина',
      query: 'рамка',
    },
    catalog: 'Каталог',
    all: 'Все товары',
    fresh: 'Новое в каталоге',
    find: 'Знаете, что нужно? Найдём по названию',
    findText:
      'Ищите по названию, системе улья или назначению: «рамка 435», «дымарь», «вощина».',
    findEyebrow: 'Поиск по каталогу',
    findLabel: 'Что ищете',
    findPlaceholder: 'Например, рамка 435',
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
    parts: [
      { name: 'Fund', detail: 'cu urdiniș' },
      { name: 'Corp', detail: 'ramă 435×300' },
      { name: 'Magazin', detail: 'ramă 435×145' },
      { name: 'Podișor', detail: 'pentru hrănire' },
      { name: 'Capac', detail: 'cu tablă' },
    ],
    systems: {
      label: 'Sisteme compatibile',
      title: 'Corpuri, magazine și rame care se potrivesc',
      text: 'Dadant, Langstroth, stup orizontal: caută piesele după tipul stupului și dimensiunea ramei, de exemplu „435×300”.',
      link: 'Piese pentru Dadant',
      query: 'Dadant',
      model: 'Pe model',
      list: [
        {
          name: 'Dadant',
          query: 'Dadant',
          lines: ['Corp 435×300', 'Magazin 435×145'],
          model: true,
        },
        {
          name: 'Langstroth',
          query: 'Langstroth',
          lines: ['Corp 435×230', 'Magazin 435×145'],
          model: false,
        },
        {
          name: 'Stup orizontal',
          query: 'Stup orizontal',
          lines: ['20–24 rame 435×300', 'Fără magazine'],
          model: false,
        },
      ],
    },
    frames: {
      label: 'Rame și faguri artificiali',
      title: 'Sezonul începe cu rama',
      text: 'Rame, faguri artificiali, sârmă și tot ce le trebuie albinelor ca să clădească faguri și să aducă miere.',
      link: 'Rame și faguri',
      query: 'ramă',
    },
    catalog: 'Catalog',
    all: 'Toate produsele',
    fresh: 'Noutăți în catalog',
    find: 'Știi ce îți trebuie? Căutăm după denumire',
    findText:
      'Caută după denumire, tipul stupului sau utilizare: „ramă 435”, „afumător”, „fagure artificial”.',
    findEyebrow: 'Căutare în catalog',
    findLabel: 'Ce cauți',
    findPlaceholder: 'De exemplu, ramă 435',
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
