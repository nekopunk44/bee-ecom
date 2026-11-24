import type { Locale } from '../i18n';
import { addOne } from './cart';
import { toggleFavorite } from './favorites';
import { flyToCart, reducedMotion } from './motion';

/* Действия в карточке товара: избранное, «в корзину» с выбором варианта и листание
   фото. Карточки рисует сервер, здесь только обработчики; без JavaScript кнопки
   скрыты, а карточка остаётся ссылкой на товар. */

/** Перезапускает CSS-анимацию: класс снимается и ставится в следующем кадре. */
function replay(element: Element, name: string) {
  element.classList.remove(name);
  requestAnimationFrame(() => element.classList.add(name));
}

function favorite(button: HTMLButtonElement) {
  const slug = button.dataset.favorite;
  if (!slug) return;
  const saved = toggleFavorite(slug);
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute(
    'aria-label',
    (saved ? button.dataset.labelRemove : button.dataset.labelAdd) ?? '',
  );
  if (saved && !reducedMotion()) replay(button, 'pop');
  // На странице избранного снятая карточка уходит из списка.
  const card = button.closest<HTMLElement>('[data-card]');
  const list = card?.closest<HTMLElement>('[data-favorites-list]');
  if (saved || !card || !list) return;
  const remove = () => {
    card.remove();
    if (!list.querySelector('[data-card]')) {
      list.hidden = true;
      document
        .querySelector<HTMLElement>('[data-favorites-empty]')
        ?.removeAttribute('hidden');
    }
  };
  if (reducedMotion()) remove();
  else
    card
      .animate(
        [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 0.9 },
        ],
        { duration: 260, easing: 'ease-in' },
      )
      .finished.then(remove, remove);
}

function closeChoices(except?: Element) {
  for (const panel of document.querySelectorAll<HTMLElement>(
    '[data-variants]:not([hidden])',
  )) {
    if (panel === except) continue;
    panel.hidden = true;
    panel
      .closest('[data-card]')
      ?.querySelector('[data-to-cart]')
      ?.setAttribute('aria-expanded', 'false');
  }
}

async function add(button: HTMLButtonElement, variantId: string) {
  const card = button.closest<HTMLElement>('[data-card]');
  const note = card?.querySelector<HTMLElement>('[data-card-note]');
  const trigger =
    card?.querySelector<HTMLButtonElement>('[data-to-cart]') ?? button;
  if (note) note.replaceChildren();
  trigger.dataset.state = 'busy';
  const result = await addOne(
    variantId,
    (trigger.dataset.locale ?? 'ru') as Locale,
  );
  if (result === 'added') {
    trigger.dataset.state = 'added';
    // Пчела летит от кнопки корзины: кнопка варианта к этому времени уже скрыта.
    flyToCart(trigger);
    setTimeout(() => {
      if (trigger.dataset.state === 'added') delete trigger.dataset.state;
    }, 1800);
    return;
  }
  delete trigger.dataset.state;
  if (!note) return;
  if (result === 'login') {
    const link = document.createElement('a');
    link.href = trigger.dataset.account ?? '/';
    link.textContent = trigger.dataset.signIn ?? '';
    note.append(link);
  } else {
    note.textContent =
      (result === 'limit' ? trigger.dataset.limit : trigger.dataset.failed) ??
      '';
  }
}

function toCart(button: HTMLButtonElement) {
  if (button.dataset.state === 'busy') return;
  const single = button.dataset.variant;
  if (single) {
    void add(button, single);
    return;
  }
  // Несколько вариантов: поверх фото открывается выбор.
  const panel = button
    .closest('[data-card]')
    ?.querySelector<HTMLElement>('[data-variants]');
  if (!panel) return;
  const open = panel.hidden;
  closeChoices(panel);
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) panel.querySelector<HTMLButtonElement>('button')?.focus();
}

/** Фото листаются пальцем (прокрутка с привязкой), а мышью — движением по картинке. */
function gallery(picture: HTMLElement) {
  const track = picture.querySelector<HTMLElement>('.track');
  const dots = [...picture.querySelectorAll<HTMLElement>('.dots > span')];
  if (!track || dots.length < 2) return;
  let shown = 0;
  const mark = (index: number) => {
    if (index === shown) return;
    dots[shown]?.removeAttribute('data-current');
    dots[index]?.setAttribute('data-current', '');
    shown = index;
  };
  track.addEventListener(
    'scroll',
    () => mark(Math.round(track.scrollLeft / track.clientWidth)),
    { passive: true },
  );
  const show = (index: number) =>
    track.scrollTo({ left: index * track.clientWidth, behavior: 'instant' });
  picture.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const box = picture.getBoundingClientRect();
    const index = Math.min(
      dots.length - 1,
      Math.max(
        0,
        Math.floor(((event.clientX - box.left) / box.width) * dots.length),
      ),
    );
    if (index !== shown) show(index);
  });
  picture.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') show(0);
  });
}

let enabled = false;
export function enableCards() {
  if (enabled || typeof document === 'undefined') return;
  enabled = true;
  document.querySelectorAll<HTMLElement>('[data-gallery]').forEach(gallery);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const heart = target?.closest<HTMLButtonElement>('[data-favorite]');
    if (heart) return favorite(heart);
    const cart = target?.closest<HTMLButtonElement>('[data-to-cart]');
    if (cart) return toCart(cart);
    const choice = target?.closest<HTMLButtonElement>('[data-variant-choice]');
    if (choice?.dataset.variantChoice) {
      closeChoices();
      void add(choice, choice.dataset.variantChoice);
      return;
    }
    if (!target?.closest('[data-variants]')) closeChoices();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeChoices();
  });
}
