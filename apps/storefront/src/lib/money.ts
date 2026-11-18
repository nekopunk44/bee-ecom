import type { Locale } from '../i18n';

const formats = new Map<Locale, Intl.NumberFormat>();

/** Суммы приходят из API в банах (1/100 лея), показываем их в леях. */
export function formatMoney(locale: Locale, minor: number) {
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale === 'ro' ? 'ro-MD' : 'ru-MD', {
      style: 'currency',
      currency: 'MDL',
    });
    formats.set(locale, format);
  }
  return format.format(minor / 100);
}
