<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  import { formatMoney as money } from '../lib/money';
  let { locale }: { locale: Locale } = $props();
  type Cart = components['schemas']['CustomerCart'];
  type Item = components['schemas']['CustomerCartItem'];
  const api = createApiClient();
  const copy = {
    ru: {
      items: 'Товары в корзине',
      positions: { one: 'товар', few: 'товара', many: 'товаров' },
      pieces: { one: 'штука', few: 'штуки', many: 'штук' },
      sku: 'артикул',
      loading: 'Загружаем корзину…',
      signIn: 'Войдите в аккаунт, чтобы посмотреть свою корзину.',
      account: 'Перейти к аккаунту',
      empty: 'Корзина пока пуста.',
      unavailable: 'Нет в наличии',
      available: 'Доступно',
      remove: 'Удалить',
      decrease: 'Уменьшить количество',
      increase: 'Увеличить количество',
      subtotal: 'Промежуточный итог',
      prices: 'Цены и наличие будут подтверждены при оформлении заказа.',
      checkout: 'Оформить заказ',
      payment: 'Оплата при получении: курьер, самовывоз или почта.',
      browse: 'Перейти в каталог',
      more: 'Продолжить покупки',
      retry: 'Повторить',
      failed: 'Не удалось загрузить корзину. Попробуйте ещё раз.',
    },
    ro: {
      items: 'Produse în coș',
      positions: { one: 'produs', few: 'produse', many: 'de produse' },
      pieces: { one: 'bucată', few: 'bucăți', many: 'de bucăți' },
      sku: 'cod',
      loading: 'Se încarcă coșul…',
      signIn: 'Autentifică-te pentru a vedea coșul tău.',
      account: 'Deschide contul',
      empty: 'Coșul este gol.',
      unavailable: 'Indisponibil',
      available: 'Disponibil',
      remove: 'Elimină',
      decrease: 'Scade cantitatea',
      increase: 'Mărește cantitatea',
      subtotal: 'Subtotal',
      prices:
        'Prețul și disponibilitatea vor fi confirmate la plasarea comenzii.',
      checkout: 'Plasează comanda',
      payment: 'Plata la primire: curier, ridicare din depozit sau poștă.',
      browse: 'Deschide catalogul',
      more: 'Continuă cumpărăturile',
      retry: 'Reîncearcă',
      failed: 'Coșul nu a putut fi încărcat. Încearcă din nou.',
    },
  }[locale];
  let cart = $state<Cart | null>(null);
  let loading = $state(true);
  let authRequired = $state(false);
  let error = $state('');
  let busyVariant = $state('');
  let subtotal = $derived(
    (cart?.items ?? []).reduce(
      (sum, item) => sum + item.unitPriceMinor * item.quantity,
      0,
    ),
  );
  // Итог не перескакивает, а досчитывает до нового значения.
  const shownSubtotal = Tween.of(() => subtotal, {
    duration: () => (prefersReducedMotion.current ? 0 : 450),
    easing: cubicOut,
  });
  let pieces = $derived(
    (cart?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
  );
  const formatMoney = (minor: number) => money(locale, minor);
  const plural = new Intl.PluralRules(locale);
  // «2 товара, 3 штуки»: в русском и румынском у слова три формы, «other» берёт последнюю.
  const count = (
    value: number,
    forms: { one: string; few: string; many: string },
  ) => {
    const form = plural.select(value);
    return `${value} ${form === 'one' ? forms.one : form === 'few' ? forms.few : forms.many}`;
  };

  async function load() {
    loading = true;
    error = '';
    authRequired = false;
    try {
      const result = await api.GET('/api/v1/cart', {
        params: { query: { locale } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) {
        authRequired = result.response.status === 401;
        error = authRequired ? '' : copy.failed;
      } else cart = result.data;
    } catch {
      error = copy.failed;
    } finally {
      loading = false;
    }
  }

  async function remove(item: Item) {
    busyVariant = item.variantId;
    error = '';
    try {
      const result = await api.DELETE('/api/v1/cart/items/{variantId}', {
        params: { path: { variantId: item.variantId }, query: { locale } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) error = copy.failed;
      else cart = result.data;
    } catch {
      error = copy.failed;
    } finally {
      busyVariant = '';
    }
  }

  async function setQuantity(item: Item, quantity: number) {
    if (quantity < 1) return remove(item);
    busyVariant = item.variantId;
    error = '';
    try {
      const result = await api.POST('/api/v1/cart/items', {
        params: { query: { locale } },
        body: { variantId: item.variantId, quantity },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) error = copy.failed;
      else cart = result.data;
    } catch {
      error = copy.failed;
    } finally {
      busyVariant = '';
    }
  }

  onMount(() => {
    void load();
  });
</script>

{#snippet hex(size: number)}
  <svg
    width={size}
    height={Math.round((size * 34) / 30)}
    viewBox="0 0 30 34"
    aria-hidden="true"
    ><polygon points="15,1 29,9 29,25 15,33 1,25 1,9" fill="#f5b700"
    ></polygon></svg
  >
{/snippet}

<div class="cart">
  {#if loading}<p class="state shimmer" aria-live="polite">{copy.loading}</p>
  {:else if authRequired}
    <div class="state">
      <p>{copy.signIn}</p>
      <a class="button" href={`/${locale}/account/`}>{copy.account}</a>
    </div>
  {:else if error}
    <div class="state">
      <p role="alert">{error}</p>
      <button class="button" onclick={load}>{copy.retry}</button>
    </div>
  {:else if !cart?.items.length}
    <div class="state">
      <p>{copy.empty}</p>
      <a class="button honey" href={`/${locale}/catalog/`}>{copy.browse}</a>
    </div>
  {:else}
    <div class="layout">
      <section aria-label={copy.items}>
        <p class="count">
          {count(cart.items.length, copy.positions)}, {count(
            pieces,
            copy.pieces,
          )}
        </p>
        <ul>
          {#each cart.items as item (item.variantId)}
            <li
              animate:flip={{ duration: 320, easing: cubicOut }}
              out:slide={{ duration: 280, easing: cubicOut }}
            >
              <span class="thumb">{@render hex(34)}</span>
              <div class="info">
                <a class="name" href={`/${locale}/catalog/${item.productSlug}/`}
                  >{item.name}</a
                >
                <p class="meta">{item.variantName}, {copy.sku} {item.sku}</p>
                <p class:warning={item.available < 1} class="meta">
                  {item.available < 1
                    ? copy.unavailable
                    : `${copy.available}: ${item.available}`}
                </p>
                <div class="row">
                  <div
                    class="stepper"
                    role="group"
                    aria-label={`${item.name}: ${item.quantity}`}
                  >
                    <button
                      aria-label={copy.decrease}
                      onclick={() => setQuantity(item, item.quantity - 1)}
                      disabled={busyVariant === item.variantId}>−</button
                    >
                    <span aria-live="polite" class="quantity">
                      {#key item.quantity}<span
                          in:fly={{ y: 8, duration: 220, easing: cubicOut }}
                          >{item.quantity}</span
                        >{/key}
                    </span>
                    <button
                      aria-label={copy.increase}
                      onclick={() => setQuantity(item, item.quantity + 1)}
                      disabled={busyVariant === item.variantId ||
                        item.quantity >= 100}>+</button
                    >
                  </div>
                  <button
                    class="remove"
                    onclick={() => remove(item)}
                    disabled={busyVariant === item.variantId}
                    >{copy.remove}</button
                  >
                  <div class="price">
                    <strong
                      >{formatMoney(
                        item.unitPriceMinor * item.quantity,
                      )}</strong
                    >
                    {#if item.quantity > 1}<span
                        >{formatMoney(item.unitPriceMinor)} × {item.quantity}</span
                      >{/if}
                  </div>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      </section>
      <aside class="summary">
        <p class="total">
          <span>{copy.subtotal}</span>
          <strong>{formatMoney(Math.round(shownSubtotal.current))}</strong>
        </p>
        <p class="note">{copy.prices}</p>
        <a class="button honey" href={`/${locale}/checkout/`}>{copy.checkout}</a
        >
        <p class="soon">{@render hex(20)}<span>{copy.payment}</span></p>
        <a class="button ghost" href={`/${locale}/catalog/`}>{copy.more}</a>
      </aside>
    </div>
  {/if}
</div>

<style>
  .cart {
    padding-top: var(--space-lg);
  }
  .state {
    display: grid;
    justify-items: start;
    gap: var(--space-md);
    max-width: 40rem;
    margin: 0;
    padding: var(--space-lg);
    border-radius: var(--radius-md);
    background: var(--color-sand);
    font-weight: 600;
  }
  .state p {
    margin: 0;
  }
  .layout {
    display: grid;
    gap: var(--space-xl);
  }
  .count {
    margin: 0;
    color: var(--color-muted);
    font-weight: 600;
  }
  ul {
    margin: var(--space-sm) 0 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-md);
    padding-block: var(--space-md);
    border-bottom: 1px solid var(--color-line);
  }
  .thumb {
    display: grid;
    place-items: center;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-honey-soft);
  }
  .name {
    font-weight: 700;
    text-decoration: none;
  }
  .name:hover {
    text-decoration: underline;
  }
  .meta {
    margin: 0.15rem 0 0;
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  .meta.warning {
    color: var(--color-danger);
    font-weight: 600;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }
  .stepper {
    display: flex;
    align-items: center;
    border-radius: var(--radius-pill);
    background: var(--color-sand);
  }
  .stepper button {
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 0;
    background: transparent;
    font-size: 1.25rem;
    line-height: 1;
  }
  .stepper .quantity {
    display: inline-grid;
    min-width: 1.5rem;
    overflow: hidden;
    text-align: center;
    font-weight: 700;
  }
  .price {
    display: grid;
    justify-items: end;
    margin-left: auto;
  }
  .price strong {
    font-family: var(--font-display);
    font-size: 1.125rem;
    letter-spacing: -0.02em;
  }
  .price span {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  .remove {
    padding: var(--space-xs) var(--space-sm);
    border: 0;
    background: transparent;
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
  .remove:hover {
    text-decoration: underline;
  }
  .summary {
    display: grid;
    gap: var(--space-md);
    align-content: start;
    padding-top: var(--space-md);
    border-top: 2px solid var(--color-ink);
  }
  .summary p {
    margin: 0;
  }
  .total {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-sm);
  }
  .total span {
    color: var(--color-muted);
  }
  .total strong {
    font-family: var(--font-display);
    font-size: 1.75rem;
    letter-spacing: -0.03em;
  }
  .note {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  .soon {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-honey-soft);
    font-size: var(--text-sm);
  }
  .soon :global(svg) {
    flex: none;
    margin-top: 0.1rem;
  }
  @media (min-width: 64rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr) 22rem;
      align-items: start;
    }
    .summary {
      position: sticky;
      top: var(--space-md);
    }
  }
</style>
