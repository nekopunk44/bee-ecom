export const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Медовая сота перелетает от кнопки к корзине в шапке, корзина подпрыгивает. */
export function flyToCart(source: Element) {
  const cart = document.querySelector<HTMLElement>('[data-cart-link]');
  if (!cart || reducedMotion()) return;
  const from = source.getBoundingClientRect();
  const to = cart.getBoundingClientRect();
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - startX;
  // Шапка не липкая: если корзина уже за краем экрана, сота улетает вверх за край.
  const dy = Math.max(to.top + to.height / 2, -40) - startY;
  const hex = document.createElement('div');
  hex.setAttribute('aria-hidden', 'true');
  hex.innerHTML =
    '<svg width="28" height="32" viewBox="0 0 30 34"><polygon points="15,1 29,9 29,25 15,33 1,25 1,9" fill="#f5b700" stroke="#17150f" stroke-width="2"/></svg>';
  Object.assign(hex.style, {
    position: 'fixed',
    left: `${startX - 14}px`,
    top: `${startY - 16}px`,
    zIndex: '1000',
    pointerEvents: 'none',
  });
  document.body.append(hex);
  const flight = hex.animate(
    [
      { transform: 'translate(0, 0) scale(0.6) rotate(0deg)', opacity: 0 },
      {
        transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 110}px) scale(1.3) rotate(150deg)`,
        opacity: 1,
        offset: 0.45,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.45) rotate(360deg)`,
        opacity: 0.8,
      },
    ],
    { duration: 780, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
  );
  flight.onfinish = () => {
    hex.remove();
    cart.classList.remove('bump');
    void cart.offsetWidth; // перезапуск анимации, если корзина уже подпрыгивала
    cart.classList.add('bump');
  };
}
