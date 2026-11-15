<script lang="ts">
  import { onMount } from 'svelte';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  let { locale }: { locale: Locale } = $props();
  type Cart = components['schemas']['CustomerCart'];
  type Item = components['schemas']['CustomerCartItem'];
  const api = createApiClient();
  const copy = {
    ru: {
      title: 'Корзина',
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
      retry: 'Повторить',
      failed: 'Не удалось загрузить корзину. Попробуйте ещё раз.',
    },
    ro: {
      title: 'Coș',
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
  const formatMoney = (minor: number) =>
    new Intl.NumberFormat(locale === 'ro' ? 'ro-MD' : 'ru-MD', {
      style: 'currency',
      currency: 'MDL',
    }).format(minor / 100);

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

<section aria-labelledby="cart-heading" class="cart">
  <h1 id="cart-heading">{copy.title}</h1>
  {#if loading}<p aria-live="polite">{copy.loading}</p>
  {:else if authRequired}
    <p>{copy.signIn}</p>
    <a class="button" href={`/${locale}/account/`}>{copy.account}</a>
  {:else if error}
    <p role="alert">{error}</p>
    <button class="button" onclick={load}>{copy.retry}</button>
  {:else if !cart?.items.length}<p>{copy.empty}</p>
  {:else}
    <ul>
      {#each cart.items as item (item.variantId)}
        <li>
          <div>
            <a href={`/${locale}/catalog/${item.productSlug}/`}>{item.name}</a>
            <p>{item.variantName}, {copy.sku} {item.sku}</p>
            <div class="quantity" aria-label={`${item.name}: ${item.quantity}`}>
              <button
                aria-label={copy.decrease}
                onclick={() => setQuantity(item, item.quantity - 1)}
                disabled={busyVariant === item.variantId}>−</button
              >
              <span aria-live="polite">{item.quantity}</span>
              <button
                aria-label={copy.increase}
                onclick={() => setQuantity(item, item.quantity + 1)}
                disabled={busyVariant === item.variantId ||
                  item.quantity >= 100}>+</button
              >
              <strong
                >{formatMoney(item.unitPriceMinor)} × {item.quantity}</strong
              >
            </div>
            <p>
              {item.available < 1
                ? copy.unavailable
                : `${copy.available}: ${item.available}`}
            </p>
          </div>
          <button
            class="remove"
            onclick={() => remove(item)}
            disabled={busyVariant === item.variantId}>{copy.remove}</button
          >
        </li>
      {/each}
    </ul>
    <p class="subtotal">
      <strong>{copy.subtotal}: {formatMoney(subtotal)}</strong>
    </p>
    <p>{copy.prices}</p>
  {/if}
</section>

<style>
  .cart {
    max-width: 56rem;
    margin: var(--space-xl) auto;
  }
  h1 {
    font-family: var(--font-display);
    font-size: clamp(2rem, 4vw, 3.5rem);
    font-weight: 400;
  }
  ul {
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    padding-block: var(--space-md);
    border-bottom: 1px solid var(--color-line);
  }
  li p {
    margin: var(--space-xs) 0;
  }
  .quantity {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-block: var(--space-sm);
  }
  .remove {
    color: var(--color-danger);
  }
  .subtotal {
    text-align: right;
    font-size: 1.25rem;
  }
</style>
