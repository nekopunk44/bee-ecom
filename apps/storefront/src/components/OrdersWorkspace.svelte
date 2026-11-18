<script lang="ts">
  import { onMount } from 'svelte';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  import { formatMoney } from '../lib/money';
  import { deliveryLabels, formatDate, statusLabels } from '../lib/orders';
  let { locale }: { locale: Locale } = $props();
  type Summary = components['schemas']['OrderSummary'];
  const api = createApiClient();
  const copy = {
    ru: {
      loading: 'Загружаем заказы…',
      signIn: 'Войдите в аккаунт, чтобы увидеть свои заказы.',
      account: 'Перейти к аккаунту',
      empty: 'Заказов пока нет.',
      browse: 'Перейти в каталог',
      failed: 'Не удалось загрузить заказы. Попробуйте ещё раз.',
      retry: 'Повторить',
      list: 'Мои заказы',
      order: 'Заказ',
      pieces: { one: 'штука', few: 'штуки', many: 'штук' },
      plusDelivery: '+ доставка',
    },
    ro: {
      loading: 'Se încarcă comenzile…',
      signIn: 'Autentifică-te pentru a vedea comenzile tale.',
      account: 'Deschide contul',
      empty: 'Nu ai încă nicio comandă.',
      browse: 'Deschide catalogul',
      failed: 'Comenzile nu au putut fi încărcate. Încearcă din nou.',
      retry: 'Reîncearcă',
      list: 'Comenzile mele',
      order: 'Comanda',
      pieces: { one: 'bucată', few: 'bucăți', many: 'de bucăți' },
      plusDelivery: '+ livrarea',
    },
  }[locale];
  let orders = $state<Summary[] | null>(null);
  let loading = $state(true);
  let authRequired = $state(false);
  let error = $state('');
  const plural = new Intl.PluralRules(locale);
  const pieces = (value: number) => {
    const form = plural.select(value);
    return `${value} ${form === 'one' ? copy.pieces.one : form === 'few' ? copy.pieces.few : copy.pieces.many}`;
  };

  async function load() {
    loading = true;
    error = '';
    authRequired = false;
    try {
      const result = await api.GET('/api/v1/orders', {
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) {
        authRequired = result.response.status === 401;
        error = authRequired ? '' : copy.failed;
      } else orders = result.data.items;
    } catch {
      error = copy.failed;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="orders">
  {#if loading}<p class="state" aria-live="polite">{copy.loading}</p>
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
  {:else if !orders?.length}
    <div class="state">
      <p>{copy.empty}</p>
      <a class="button honey" href={`/${locale}/catalog/`}>{copy.browse}</a>
    </div>
  {:else}
    <ul aria-label={copy.list}>
      {#each orders as order (order.id)}
        <li>
          <a href={`/${locale}/orders/${order.id}/`}>
            <span class="head">
              <strong>{copy.order} {order.number}</strong>
              <span class={`status ${order.status}`}
                >{statusLabels[locale][order.status]}</span
              >
            </span>
            <span class="meta">
              {formatDate(locale, order.createdAt)} · {deliveryLabels[locale][
                order.deliveryMethod
              ]} · {pieces(order.quantity)}
            </span>
            <span class="sum">
              {formatMoney(locale, order.totalMinor ?? order.itemsTotalMinor)}
              {#if order.totalMinor === null}<small>{copy.plusDelivery}</small
                >{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .orders {
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
  ul {
    display: grid;
    gap: var(--space-sm);
    max-width: 48rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  a {
    display: grid;
    gap: 0.25rem;
    padding: var(--space-md) var(--space-lg);
    border: 2px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-paper);
    text-decoration: none;
  }
  a:hover {
    border-color: var(--color-ink);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .head strong {
    font-family: var(--font-display);
    font-size: 1.25rem;
    letter-spacing: -0.02em;
  }
  .status {
    padding: 0.1rem 0.6rem;
    border-radius: var(--radius-pill);
    background: var(--color-honey-soft);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .status.cancelled {
    background: var(--color-sand);
    color: var(--color-muted);
  }
  .meta {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  .sum {
    font-weight: 700;
  }
  .sum small {
    color: var(--color-muted);
    font-weight: 400;
  }
</style>
