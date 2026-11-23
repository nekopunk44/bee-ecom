export const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Пчела, развёрнутая головой вправо: крылья машут через CSS (.flying-bee .wing в motion.css). */
const BEE_SVG =
  '<svg width="34" height="28" viewBox="0 0 34 28">' +
  '<ellipse class="wing" cx="13" cy="9" rx="7" ry="5" fill="#fffaf0" fill-opacity="0.85" stroke="#17150f" stroke-width="1.2"/>' +
  '<ellipse class="wing back" cx="18" cy="8" rx="6" ry="4.5" fill="#fffaf0" fill-opacity="0.7" stroke="#17150f" stroke-width="1.2"/>' +
  '<ellipse cx="14" cy="17" rx="11" ry="7.5" fill="#f5b700" stroke="#17150f" stroke-width="1.6"/>' +
  '<path d="M9 10.4v13.2M14 9.5v15M19 10.4v13.2" stroke="#17150f" stroke-width="2.6"/>' +
  '<circle cx="27" cy="16" r="5" fill="#17150f"/>' +
  '<path d="M29 12c1-3 2-4 4-5M30.5 13.5c1.5-2 2.5-2.5 3.5-2.5" stroke="#17150f" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
  '<path d="M3 17l-3 1" stroke="#17150f" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>';

/** Пчела летит от кнопки к корзине в шапке по дуге с покачиванием, корзина подпрыгивает. */
export function flyToCart(source: Element) {
  const cart = document.querySelector<HTMLElement>('[data-cart-link]');
  if (!cart || reducedMotion()) return;
  const from = source.getBoundingClientRect();
  const to = cart.getBoundingClientRect();
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - startX;
  // Шапка не липкая: если корзина уже за краем экрана, пчела улетает вверх за край.
  const dy = Math.max(to.top + to.height / 2, -40) - startY;
  const bee = document.createElement('div');
  bee.setAttribute('aria-hidden', 'true');
  bee.className = 'flying-bee';
  bee.innerHTML = BEE_SVG;
  Object.assign(bee.style, {
    position: 'fixed',
    left: `${startX - 17}px`,
    top: `${startY - 14}px`,
    zIndex: '1000',
    pointerEvents: 'none',
  });
  document.body.append(bee);

  // Кубическая дуга вверх и к корзине, поперёк неё пчелу покачивает, как в настоящем полёте.
  const c1 = { x: dx * 0.15, y: -150 };
  const c2 = { x: dx * 0.8, y: dy - 160 };
  const point = (t: number) => {
    const u = 1 - t;
    return {
      x: 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * dx,
      y: 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * dy,
    };
  };
  // Летит влево — отражаем её; наклон носа по ходу полёта после отражения остаётся верным.
  const facing = dx < 0 ? -1 : 1;
  const frames: Keyframe[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const here = point(t);
    const ahead = point(Math.min(1, t + 0.02));
    const back = point(Math.max(0, t - 0.02));
    const angle = Math.atan2(ahead.y - back.y, Math.abs(ahead.x - back.x) || 1);
    const wobble = Math.sin(t * Math.PI * 4) * 12 * (1 - t);
    const scale = 0.6 + Math.sin(t * Math.PI) * 0.6 - t * 0.15;
    frames.push({
      transform:
        `translate(${(here.x - wobble * Math.sin(angle)).toFixed(1)}px, ${(here.y + wobble * Math.cos(angle)).toFixed(1)}px) ` +
        `scale(${(scale * facing).toFixed(3)}, ${scale.toFixed(3)}) rotate(${(((angle * 180) / Math.PI) * 0.6).toFixed(1)}deg)`,
      opacity: i === 0 ? 0 : i === steps ? 0.85 : 1,
    });
  }
  const flight = bee.animate(frames, {
    duration: 950,
    easing: 'cubic-bezier(0.45, 0, 0.25, 1)',
  });
  flight.onfinish = () => {
    bee.remove();
    cart.classList.remove('bump');
    void cart.offsetWidth; // перезапуск анимации, если корзина уже подпрыгивала
    cart.classList.add('bump');
  };
}

/**
 * Карточки товаров наклоняются за курсором, по фото проходит блик. Один обработчик на
 * страницу для всех [data-tilt]; на сенсорных экранах и при «уменьшить движение» не нужен.
 */
export function enableTilt() {
  if (
    reducedMotion() ||
    !matchMedia('(hover: hover) and (pointer: fine)').matches
  )
    return;
  let active: HTMLElement | null = null;
  let frame = 0;
  let x = 0.5;
  let y = 0.5;
  const reset = (element: HTMLElement) => {
    for (const name of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y'])
      element.style.removeProperty(name);
  };
  const apply = () => {
    frame = 0;
    if (!active) return;
    active.style.setProperty('--tilt-x', `${((0.5 - y) * 9).toFixed(2)}deg`);
    active.style.setProperty('--tilt-y', `${((x - 0.5) * 11).toFixed(2)}deg`);
    active.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
    active.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
  };
  document.addEventListener(
    'pointermove',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (active && active !== card) reset(active);
      active = card;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      x = (event.clientX - rect.left) / rect.width;
      y = (event.clientY - rect.top) / rect.height;
      frame ||= requestAnimationFrame(apply);
    },
    { passive: true },
  );
  document.addEventListener('pointerout', (event) => {
    if (active && !event.relatedTarget) {
      reset(active);
      active = null;
    }
  });
}
