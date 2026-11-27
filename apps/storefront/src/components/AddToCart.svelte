<script lang="ts">
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { addOne } from '../lib/cart';
  import { flyToCart } from '../lib/motion';
  import { signIn } from '../lib/sign-in';
  import type { Locale } from '../i18n';
  let { variantId, locale }: { variantId: string; locale: Locale } = $props();
  const copy = {
    ru: {
      add: 'В корзину',
      added: 'Добавлено',
      cart: 'Корзина',
      failed: 'Не удалось добавить. Попробуйте ещё раз.',
      limit: 'В корзине уже 100 штук этого товара.',
    },
    ro: {
      add: 'Adaugă în coș',
      added: 'Adăugat',
      cart: 'Coș',
      failed: 'Adăugarea a eșuat. Încearcă din nou.',
      limit: 'Coșul conține deja 100 de bucăți din acest produs.',
    },
  }[locale];
  let busy = $state(false);
  let done = $state(false);
  let error = $state('');
  let button = $state<HTMLButtonElement>();

  async function add() {
    busy = true;
    error = '';
    const result = await addOne(variantId, locale);
    busy = false;
    if (result === 'added') {
      done = true;
      if (button) flyToCart(button);
      return;
    }
    // Гость: поверх страницы открывается вход. Вошёл и закрыл окно — товар
    // добавляется сам, и пчела летит в корзину уже на глазах.
    if (result === 'login') {
      if (await signIn(button)) await add();
      return;
    }
    error = result === 'limit' ? copy.limit : copy.failed;
  }
</script>

<div class="cart-action">
  <button
    class="button honey"
    class:busy
    onclick={add}
    disabled={busy}
    bind:this={button}
  >
    {#key done}
      <span class="label" in:fly={{ y: 10, duration: 320, easing: backOut }}>
        {#if done}<svg
            class="check"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
          >{/if}{done ? copy.added : copy.add}
      </span>
    {/key}
  </button>
  {#if done}<a
      class="button ghost"
      href={`/${locale}/cart/`}
      in:fly={{ x: -12, duration: 360, easing: backOut }}>{copy.cart}</a
    >{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .cart-action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .honey {
    flex: 1 1 14rem;
    min-height: 3.5rem;
    font-size: 1.125rem;
  }
  .ghost {
    min-height: 3.5rem;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* Галочка дорисовывается штрихом, как от руки. */
  .check path {
    fill: none;
    stroke: currentcolor;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 24;
    animation: draw 420ms var(--ease-out) 120ms both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 24;
    }
  }
  /* Пока запрос идёт, кнопка тихо «дышит», а не застывает. */
  .busy {
    animation: pending 900ms var(--ease-in-out) infinite;
  }
  @keyframes pending {
    50% {
      opacity: 0.7;
      transform: scale(0.985);
    }
  }
  p {
    flex-basis: 100%;
    margin: 0;
    color: var(--color-danger);
    font-weight: 600;
  }
</style>
