/**
 * Шкала цены в фильтре каталога. Цены идут от десятков леев до десятков тысяч, поэтому
 * шкала логарифмическая: так же API раскладывает товары по 24 корзинам гистограммы.
 * Положение — число от 0 до 1, цена — в леях.
 */
export const BUCKETS = 24;
/** Шагов у ползунка: по десять на корзину, стрелка на клавиатуре сдвигает цену на 2–3 %. */
export const STEPS = 240;

/** Круглая цена: до сотни — до лея, дальше до 10, 50 и 100 леев. */
export const roundPrice = (value: number) => {
  const step = value < 100 ? 1 : value < 1000 ? 10 : value < 10000 ? 50 : 100;
  return Math.round(value / step) * step;
};

export function priceScale(low: number, high: number) {
  const from = Math.max(1, low);
  const span = Math.log(Math.max(high, from + 1) / from);
  return {
    price: (position: number) => roundPrice(from * Math.exp(span * position)),
    position: (price: number) =>
      Math.min(1, Math.max(0, Math.log(Math.max(price, from) / from) / span)),
  };
}

/** Цена из поля или адреса: только цифры, не больше миллиона леев (предел API). */
export const priceParam = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '').slice(0, 9);
  return digits ? String(Math.min(Number(digits), 1_000_000)) : '';
};
