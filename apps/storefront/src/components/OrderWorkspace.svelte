<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  import { formatMoney } from '../lib/money';
  import { deliveryLabels, formatDate, statusLabels } from '../lib/orders';
  let {
    locale,
    orderId,
    placed = false,
  }: { locale: Locale; orderId: string; placed?: boolean } = $props();
  type Order = components['schemas']['Order'];
  const api = createApiClient();
  const copy = {
    ru: {
      loading: 'Загружаем заказ…',
      signIn: 'Войдите в аккаунт, чтобы увидеть заказ.',
      account: 'Перейти к аккаунту',
      missing: 'Такого заказа нет среди ваших заказов.',
      failed: 'Не удалось загрузить заказ. Попробуйте ещё раз.',
      retry: 'Повторить',
      order: 'Заказ',
      placed:
        'Заказ оформлен. Мы позвоним, чтобы подтвердить его, и сообщим, когда он будет готов.',
      from: 'от',
      items: 'Товары',
      sku: 'артикул',
      delivery: 'Получение',
      method: 'Способ',
      warehouse: 'Склад',
      address: 'Адрес',
      recipient: 'Получатель',
      comment: 'Комментарий',
      tracking: 'Трек-номер',
      payment: 'Оплата при получении',
      itemsTotal: 'Товары',
      shipping: 'Доставка',
      free: 'Бесплатно',
      shippingLater: 'Сообщим при подтверждении',
      total: 'Итого',
      plusDelivery: 'плюс доставка',
      history: 'История',
      cancel: 'Отменить заказ',
      cancelQuestion: 'Отменить заказ? Отложенные товары вернутся на склад.',
      confirmCancel: 'Да, отменить',
      keep: 'Не отменять',
      cancelFailed: 'Не удалось отменить заказ. Попробуйте ещё раз.',
      notCancellable:
        'Заказ уже подтверждён, отменить его здесь нельзя. Позвоните нам.',
      all: 'Все заказы',
    },
    ro: {
      loading: 'Se încarcă comanda…',
      signIn: 'Autentifică-te pentru a vedea comanda.',
      account: 'Deschide contul',
      missing: 'Această comandă nu se află printre comenzile tale.',
      failed: 'Comanda nu a putut fi încărcată. Încearcă din nou.',
      retry: 'Reîncearcă',
      order: 'Comanda',
      placed:
        'Comanda a fost plasată. Te sunăm pentru confirmare și te anunțăm când este gata.',
      from: 'din',
      items: 'Produse',
      sku: 'cod',
      delivery: 'Primire',
      method: 'Modul',
      warehouse: 'Depozit',
      address: 'Adresa',
      recipient: 'Destinatar',
      comment: 'Comentariu',
      tracking: 'Număr de urmărire',
      payment: 'Plata la primire',
      itemsTotal: 'Produse',
      shipping: 'Livrare',
      free: 'Gratuit',
      shippingLater: 'Comunicăm la confirmare',
      total: 'Total',
      plusDelivery: 'plus livrarea',
      history: 'Istoric',
      cancel: 'Anulează comanda',
      cancelQuestion: 'Anulezi comanda? Produsele rezervate revin în depozit.',
      confirmCancel: 'Da, anulează',
      keep: 'Nu anula',
      cancelFailed: 'Comanda nu a putut fi anulată. Încearcă din nou.',
      notCancellable:
        'Comanda este deja confirmată și nu poate fi anulată aici. Sună-ne.',
      all: 'Toate comenzile',
    },
  }[locale];
  let order = $state<Order | null>(null);
  let loading = $state(true);
  let authRequired = $state(false);
  let missing = $state(false);
  let error = $state('');
  let confirming = $state(false);
  let busy = $state(false);
  let cancelError = $state('');

  async function load() {
    loading = true;
    error = '';
    authRequired = false;
    missing = false;
    try {
      const result = await api.GET('/api/v1/orders/{orderId}', {
        params: { path: { orderId } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) {
        authRequired = result.response.status === 401;
        missing = result.response.status === 404;
        error = authRequired || missing ? '' : copy.failed;
      } else order = result.data;
    } catch {
      error = copy.failed;
    } finally {
      loading = false;
    }
  }

  async function cancel() {
    busy = true;
    cancelError = '';
    try {
      const result = await api.POST('/api/v1/orders/{orderId}/cancel', {
        params: { path: { orderId } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) {
        cancelError =
          result.error.error.code === 'ORDER_NOT_CANCELLABLE'
            ? copy.notCancellable
            : copy.cancelFailed;
        if (result.error.error.code === 'ORDER_NOT_CANCELLABLE') await load();
      } else {
        order = result.data;
        confirming = false;
      }
    } catch {
      cancelError = copy.cancelFailed;
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="order">
  {#if loading && !order}<p class="state shimmer" aria-live="polite">
      {copy.loading}
    </p>
  {:else if authRequired}
    <div class="state">
      <p>{copy.signIn}</p>
      <a class="button" href={`/${locale}/account/`}>{copy.account}</a>
    </div>
  {:else if missing}
    <div class="state">
      <p>{copy.missing}</p>
      <a class="button" href={`/${locale}/orders/`}>{copy.all}</a>
    </div>
  {:else if error || !order}
    <div class="state">
      <p role="alert">{error}</p>
      <button class="button" onclick={load}>{copy.retry}</button>
    </div>
  {:else}
    {#if placed && order.status === 'new'}
      <p
        class="placed"
        role="status"
        in:scale={{ start: 0.94, duration: 520, easing: backOut }}
      >
        <!-- Соты разлетаются из значка: маленький праздник оформленного заказа. -->
        <span class="burst" aria-hidden="true">
          {#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
            <i></i>
          {/each}
          <svg width="26" height="30" viewBox="0 0 30 34"
            ><polygon
              points="15,1 29,9 29,25 15,33 1,25 1,9"
              fill="#f5b700"
              stroke="#17150f"
              stroke-width="2"
            ></polygon></svg
          >
        </span>
        <span>{copy.placed}</span>
      </p>
    {/if}
    <div class="layout">
      <div class="main">
        <header>
          <h2>{copy.order} {order.number}</h2>
          <span class={`status ${order.status}`}
            >{statusLabels[locale][order.status]}</span
          >
          <p>{copy.from} {formatDate(locale, order.createdAt)}</p>
        </header>

        <section aria-labelledby="order-items">
          <h3 id="order-items">{copy.items}</h3>
          <ul>
            {#each order.items as item (item.variantId)}
              <li>
                <span>
                  <a href={`/${locale}/catalog/${item.productSlug}/`}
                    >{item.name}</a
                  >
                  <small
                    >{item.variantName}, {copy.sku}
                    {item.sku} · {formatMoney(locale, item.unitPriceMinor)} × {item.quantity}</small
                  >
                </span>
                <strong
                  >{formatMoney(
                    locale,
                    item.unitPriceMinor * item.quantity,
                  )}</strong
                >
              </li>
            {/each}
          </ul>
        </section>

        <section aria-labelledby="order-delivery">
          <h3 id="order-delivery">{copy.delivery}</h3>
          <dl class="facts">
            <div>
              <dt>{copy.method}</dt>
              <dd>{deliveryLabels[locale][order.deliveryMethod]}</dd>
            </div>
            {#if order.warehouse}
              <div>
                <dt>{copy.warehouse}</dt>
                <dd>{order.warehouse.name}</dd>
              </div>
            {/if}
            {#if order.address}
              <div>
                <dt>{copy.address}</dt>
                <dd>
                  {[order.postalCode, order.locality, order.address]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            {/if}
            <div>
              <dt>{copy.recipient}</dt>
              <dd>{order.recipientName}, {order.phone}</dd>
            </div>
            {#if order.comment}
              <div>
                <dt>{copy.comment}</dt>
                <dd>{order.comment}</dd>
              </div>
            {/if}
            {#if order.trackingNumber}
              <div>
                <dt>{copy.tracking}</dt>
                <dd>{order.trackingNumber}</dd>
              </div>
            {/if}
          </dl>
        </section>

        <section aria-labelledby="order-history">
          <h3 id="order-history">{copy.history}</h3>
          <ol class="history">
            {#each order.history as step, index (step.at + step.status)}
              <li
                in:fly={{
                  x: -12,
                  duration: 380,
                  delay: 200 + index * 90,
                  easing: cubicOut,
                }}
              >
                <strong>{statusLabels[locale][step.status]}</strong>
                <time datetime={step.at}>{formatDate(locale, step.at)}</time>
              </li>
            {/each}
          </ol>
        </section>
      </div>

      <aside class="summary">
        <dl>
          <div>
            <dt>{copy.itemsTotal}</dt>
            <dd>{formatMoney(locale, order.itemsTotalMinor)}</dd>
          </div>
          <div>
            <dt>{copy.shipping}</dt>
            <dd>
              {order.deliveryPriceMinor === 0
                ? copy.free
                : order.deliveryPriceMinor !== null
                  ? formatMoney(locale, order.deliveryPriceMinor)
                  : copy.shippingLater}
            </dd>
          </div>
          <div class="total">
            <dt>{copy.total}</dt>
            <dd>
              {formatMoney(locale, order.totalMinor ?? order.itemsTotalMinor)}
              {#if order.totalMinor === null}<small>{copy.plusDelivery}</small
                >{/if}
            </dd>
          </div>
        </dl>
        <p class="note">{copy.payment}</p>
        {#if order.status === 'new'}
          {#if confirming}
            <div class="confirm" role="group" aria-label={copy.cancel}>
              <p>{copy.cancelQuestion}</p>
              <button class="button" onclick={cancel} disabled={busy}
                >{copy.confirmCancel}</button
              >
              <button
                class="button ghost"
                onclick={() => (confirming = false)}
                disabled={busy}>{copy.keep}</button
              >
            </div>
          {:else}
            <button class="button ghost" onclick={() => (confirming = true)}
              >{copy.cancel}</button
            >
          {/if}
        {/if}
        {#if cancelError}<p class="error" role="alert">{cancelError}</p>{/if}
        <a href={`/${locale}/orders/`}>{copy.all}</a>
      </aside>
    </div>
  {/if}
</div>

<style>
  .order {
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
  .placed {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    max-width: 48rem;
    margin: 0 0 var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    background: var(--color-honey-soft);
    font-weight: 600;
  }
  .burst {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
  }
  .burst svg {
    animation: pop 640ms var(--ease-spring) 120ms both;
  }
  .burst i {
    position: absolute;
    width: 0.55rem;
    height: 0.62rem;
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    background: var(--color-honey);
    opacity: 0;
    animation: spark 900ms var(--ease-out) 220ms both;
  }
  /* Углы лучей в CSS: встроенный style запрещён политикой безопасности. */
  .burst i:nth-of-type(1) {
    --angle: 0deg;
  }
  .burst i:nth-of-type(2) {
    --angle: 45deg;
  }
  .burst i:nth-of-type(3) {
    --angle: 90deg;
  }
  .burst i:nth-of-type(4) {
    --angle: 135deg;
  }
  .burst i:nth-of-type(5) {
    --angle: 180deg;
  }
  .burst i:nth-of-type(6) {
    --angle: 225deg;
  }
  .burst i:nth-of-type(7) {
    --angle: 270deg;
  }
  .burst i:nth-of-type(8) {
    --angle: 315deg;
  }
  @keyframes pop {
    from {
      transform: scale(0.3) rotate(-60deg);
    }
  }
  @keyframes spark {
    0% {
      opacity: 1;
      transform: rotate(var(--angle)) translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: rotate(var(--angle)) translateY(-2.6rem) scale(0.4);
    }
  }
  /* Новый заказ ждёт звонка: метка статуса мягко пульсирует. */
  .status.new {
    animation: waiting 2.4s var(--ease-in-out) infinite;
  }
  @keyframes waiting {
    50% {
      box-shadow: 0 0 0 0.35rem rgb(245 183 0 / 25%);
    }
  }
  .layout {
    display: grid;
    gap: var(--space-xl);
  }
  .main {
    display: grid;
    gap: var(--space-lg);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs) var(--space-sm);
  }
  header p {
    flex-basis: 100%;
    margin: 0;
    color: var(--color-muted);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.75rem;
    letter-spacing: -0.03em;
  }
  h3 {
    margin: 0 0 var(--space-sm);
    font-size: 1.125rem;
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
  ul,
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ul li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    padding-block: var(--space-sm);
    border-bottom: 1px solid var(--color-line);
  }
  ul li span {
    display: grid;
  }
  ul li a {
    font-weight: 700;
    text-decoration: none;
  }
  ul li a:hover {
    text-decoration: underline;
  }
  small {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  ul li strong {
    white-space: nowrap;
  }
  .facts {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
  }
  .facts div {
    display: grid;
    grid-template-columns: minmax(7rem, 12rem) minmax(0, 1fr);
    gap: var(--space-sm);
  }
  .facts dt {
    color: var(--color-muted);
  }
  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .history {
    display: grid;
    gap: var(--space-xs);
  }
  .history li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
  .history time {
    color: var(--color-muted);
  }
  .summary {
    display: grid;
    gap: var(--space-md);
    align-content: start;
    padding-top: var(--space-md);
    border-top: 2px solid var(--color-ink);
  }
  .summary dl {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
  }
  .summary dl div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-sm);
  }
  .summary dt {
    color: var(--color-muted);
  }
  .summary dd {
    margin: 0;
    text-align: right;
    font-weight: 600;
  }
  .total dd {
    display: grid;
    font-family: var(--font-display);
    font-size: 1.75rem;
    letter-spacing: -0.03em;
  }
  .total small {
    font-family: var(--font-body);
    font-weight: 400;
    letter-spacing: 0;
  }
  .note {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  .confirm {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-sand);
  }
  .confirm p {
    margin: 0;
    font-weight: 600;
  }
  .error {
    margin: 0;
    color: var(--color-danger);
    font-weight: 600;
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
