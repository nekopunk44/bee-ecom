<script lang="ts">
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { createApiClient } from '@bee/api-client';
  import { flyToCart } from '../lib/motion';
  import type { Locale } from '../i18n';
  let { variantId, locale }: { variantId: string; locale: Locale } = $props();
  const api = createApiClient();
  const copy = {
    ru: {
      add: 'В корзину',
      added: 'Добавлено',
      cart: 'Корзина',
      signIn: 'Войдите, чтобы добавить товар',
      failed: 'Не удалось добавить. Попробуйте ещё раз.',
      limit: 'В корзине уже 100 штук этого товара.',
    },
    ro: {
      add: 'Adaugă în coș',
      added: 'Adăugat',
      cart: 'Coș',
      signIn: 'Autentifică-te pentru a adăuga produsul',
      failed: 'Adăugarea a eșuat. Încearcă din nou.',
      limit: 'Coșul conține deja 100 de bucăți din acest produs.',
    },
  }[locale];
  let busy = $state(false);
  let done = $state(false);
  let error = $state('');
  let needsLogin = $state(false);
  let button = $state<HTMLButtonElement>();

  async function add() {
    busy = true;
    error = '';
    needsLogin = false;
    try {
      // API задаёт количество, а не прибавляет: берём то, что уже лежит в корзине, и добавляем одну штуку.
      const current = await api.GET('/api/v1/cart', {
        params: { query: { locale } },
        signal: AbortSignal.timeout(10000),
      });
      if (current.error) {
        needsLogin = current.response.status === 401;
        error = needsLogin ? copy.signIn : copy.failed;
        return;
      }
      const inCart =
        current.data.items.find((item) => item.variantId === variantId)
          ?.quantity ?? 0;
      if (inCart >= 100) {
        error = copy.limit;
        return;
      }
      const result = await api.POST('/api/v1/cart/items', {
        params: { query: { locale } },
        body: { variantId, quantity: inCart + 1 },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) {
        needsLogin = result.response.status === 401;
        error = needsLogin ? copy.signIn : copy.failed;
        return;
      }
      done = true;
      if (button) flyToCart(button);
    } catch {
      error = copy.failed;
    } finally {
      busy = false;
    }
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
  {#if needsLogin}<a class="login" href={`/${locale}/account/`}>{copy.signIn}</a
    >{/if}
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
  .login {
    font-weight: 700;
  }
</style>
