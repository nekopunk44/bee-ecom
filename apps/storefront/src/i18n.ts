export const locales = ['ru', 'ro'] as const;
export type Locale = (typeof locales)[number];

export const messages = {
  ru: {
    title: 'Bee — оборудование для современной пасеки',
    description:
      'Оборудование для пчеловодства в Молдове. Готовим новый магазин Bee.',
    skip: 'Перейти к содержимому',
    locale: 'Язык сайта',
    label: 'Современная пасека · Молдова',
    heading: 'Хорошая пасека начинается с правильных вещей.',
    intro:
      'Продуманное оборудование. Совместимые системы. Всё, что помогает заботиться о пчёлах и развивать своё дело.',
    notice:
      'Изучайте каталог. Оформление заказов появится после открытия магазина.',
    section: 'Основа вашей пасеки',
    cards: [
      {
        number: '01',
        title: 'Ульи и рамки',
        text: 'Системы, в которых каждая деталь на своём месте.',
      },
      {
        number: '02',
        title: 'Оборудование',
        text: 'Инструменты для ежедневной работы и медосбора.',
      },
      {
        number: '03',
        title: 'Забота и защита',
        text: 'Внимание к пчёлам. Комфорт для пчеловода.',
      },
    ],
    footer: 'Для тех, кто создаёт свою пасеку.',
  },
  ro: {
    title: 'Bee — echipamente pentru stupina modernă',
    description: 'Echipamente apicole în Moldova. Pregătim noul magazin Bee.',
    skip: 'Salt la conținut',
    locale: 'Limba site-ului',
    label: 'Stupina modernă · Moldova',
    heading: 'O stupină bună începe cu alegerile potrivite.',
    intro:
      'Echipamente bine gândite. Sisteme compatibile. Tot ce te ajută să îngrijești albinele și să îți dezvolți afacerea.',
    notice:
      'Descoperă catalogul. Comenzile vor fi disponibile după deschiderea magazinului.',
    section: 'Baza stupinei tale',
    cards: [
      {
        number: '01',
        title: 'Stupi și rame',
        text: 'Sisteme în care fiecare detaliu își are locul.',
      },
      {
        number: '02',
        title: 'Echipamente',
        text: 'Unelte pentru munca de zi cu zi și recoltarea mierii.',
      },
      {
        number: '03',
        title: 'Îngrijire și protecție',
        text: 'Grijă pentru albine. Confort pentru apicultor.',
      },
    ],
    footer: 'Pentru cei care își construiesc propria stupină.',
  },
} satisfies Record<Locale, object>;

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}
