import type { components } from '@bee/api-client';
import type { Locale } from '../i18n';

type Order = components['schemas']['Order'];
export type OrderStatus = Order['status'];
export type DeliveryMethod = Order['deliveryMethod'];

export const statusLabels: Record<Locale, Record<OrderStatus, string>> = {
  ru: {
    new: 'Новый',
    confirmed: 'Подтверждён',
    ready: 'Собран',
    shipped: 'Отправлен',
    completed: 'Выполнен',
    cancelled: 'Отменён',
  },
  ro: {
    new: 'Nouă',
    confirmed: 'Confirmată',
    ready: 'Pregătită',
    shipped: 'Expediată',
    completed: 'Finalizată',
    cancelled: 'Anulată',
  },
};

export const deliveryLabels: Record<Locale, Record<DeliveryMethod, string>> = {
  ru: {
    courier: 'Курьером',
    pickup: 'Самовывоз со склада',
    post: 'Почтой',
  },
  ro: {
    courier: 'Prin curier',
    pickup: 'Ridicare din depozit',
    post: 'Prin poștă',
  },
};

/** Дата заказа без секунд: «18 ноября 2026 г., 16:20». */
export function formatDate(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale === 'ro' ? 'ro-MD' : 'ru-MD', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}
