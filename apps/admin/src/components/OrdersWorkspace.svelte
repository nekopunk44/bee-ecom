<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { components } from '@bee/api-client';
  import { api, errorText } from '../lib/catalog';

  type Summary = components['schemas']['AdminOrderSummary'];
  type Order = components['schemas']['Order'];
  type Status = Order['status'];
  type Change = components['schemas']['OrderStatusChange'];
  let {
    permissions,
    onExpired,
  }: { permissions: string[]; onExpired: () => void } = $props();

  const pageSize = 25;
  const statuses: Status[] = [
    'new',
    'confirmed',
    'ready',
    'shipped',
    'completed',
    'cancelled',
  ];
  const statusLabel: Record<Status, string> = {
    new: 'Новый',
    confirmed: 'Подтверждён',
    ready: 'Собран',
    shipped: 'Отправлен',
    completed: 'Выполнен',
    cancelled: 'Отменён',
  };
  const filterLabel: Record<Status, string> = {
    new: 'Новые',
    confirmed: 'Подтверждённые',
    ready: 'Собранные',
    shipped: 'Отправленные',
    completed: 'Выполненные',
    cancelled: 'Отменённые',
  };
  const methodLabel: Record<Order['deliveryMethod'], string> = {
    courier: 'Курьер',
    pickup: 'Самовывоз',
    post: 'Почта',
  };
  const money = new Intl.NumberFormat('ru-MD', {
    style: 'currency',
    currency: 'MDL',
  });
  const date = new Intl.DateTimeFormat('ru-MD', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const formatMoney = (minor: number) => money.format(minor / 100);

  let orders = $state<Summary[]>([]);
  let counts = $state<Record<Status, number> | null>(null);
  let total = $state(0);
  let filter = $state<Status | ''>('new');
  let query = $state('');
  let page = $state(1);
  let loading = $state(false);
  let error = $state('');
  let notice = $state('');
  let order = $state<Order | null>(null);
  let busy = $state(false);
  let confirmingCancel = $state(false);
  let price = $state('');
  let tracking = $state('');
  const canManage = $derived(permissions.includes('orders.manage'));

  async function load() {
    loading = true;
    error = '';
    try {
      const result = await api.GET('/api/v1/admin/orders', {
        params: {
          query: {
            ...(filter ? { status: filter } : {}),
            ...(query.trim() ? { q: query.trim() } : {}),
            limit: pageSize,
            offset: (page - 1) * pageSize,
          },
        },
        signal: AbortSignal.timeout(10000),
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (result.error) {
        error = errorText(result.error.error.code);
        return;
      }
      orders = result.data.items;
      total = result.data.total;
      counts = result.data.counts;
    } catch {
      error = errorText();
    } finally {
      loading = false;
    }
  }

  function prepare(next: Order) {
    order = next;
    confirmingCancel = false;
    price =
      next.deliveryPriceMinor === null
        ? ''
        : String(next.deliveryPriceMinor / 100).replace('.', ',');
    tracking = next.trackingNumber ?? '';
  }

  // keepMessage: после конфликта перезагружаем заказ, но объяснение оставляем на экране.
  async function open(id: string, keepMessage = false) {
    busy = true;
    if (!keepMessage) {
      error = '';
      notice = '';
    }
    try {
      const result = await api.GET('/api/v1/admin/orders/{orderId}', {
        params: { path: { orderId: id } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (result.error) {
        error = errorText(result.error.error.code);
        return;
      }
      prepare(result.data);
      await tick();
      document.getElementById('order-heading')?.focus();
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }

  // «45», «45,50» или «45.5» лея → 4550 банов; пустое поле — цену не трогаем.
  function priceMinor(): number | null | undefined {
    const text = price.trim().replace(',', '.');
    if (!text) return undefined;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
    return Math.round(Number(text) * 100);
  }

  async function move(to: Change['to']) {
    if (!order) return;
    const change: Change = { from: order.status, to };
    if (to === 'confirmed' && order.deliveryMethod !== 'pickup') {
      const minor = priceMinor();
      if (minor === null) {
        error = 'Цена доставки — число в леях, например 45 или 45,50.';
        return;
      }
      if (minor !== undefined) change.deliveryPriceMinor = minor;
    }
    if (to === 'shipped' && tracking.trim())
      change.trackingNumber = tracking.trim();
    busy = true;
    error = '';
    notice = '';
    try {
      const result = await api.POST('/api/v1/admin/orders/{orderId}/status', {
        params: { path: { orderId: order.id } },
        body: change,
        signal: AbortSignal.timeout(10000),
      });
      if (result.response.status === 401) {
        onExpired();
        return;
      }
      if (result.error) {
        error = errorText(result.error.error.code);
        // Кто-то успел изменить заказ: показываем актуальное состояние.
        if (result.error.error.code === 'ORDER_STATUS_CHANGED')
          await open(order.id, true);
        return;
      }
      prepare(result.data);
      notice = `Заказ ${result.data.number}: ${statusLabel[result.data.status].toLowerCase()}.`;
      await load();
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }

  function choose(next: Status | '') {
    filter = next;
    page = 1;
    void load();
  }

  onMount(() => void load());
</script>

<section class="orders" aria-labelledby="orders-heading">
  <h2 id="orders-heading" class="visually-hidden">Заказы</h2>
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  {#if notice}<p role="status" class="notice">{notice}</p>{/if}

  <div class="filters" role="group" aria-label="Статус заказов">
    <button
      aria-pressed={filter === ''}
      onclick={() => choose('')}
      disabled={loading}>Все</button
    >
    {#each statuses as status (status)}
      <button
        aria-pressed={filter === status}
        onclick={() => choose(status)}
        disabled={loading}
        >{filterLabel[status]}{#if counts}<span class="count"
            >{counts[status]}</span
          >{/if}</button
      >
    {/each}
  </div>

  <form
    class="search"
    onsubmit={(event) => {
      event.preventDefault();
      page = 1;
      void load();
    }}
  >
    <label
      >Поиск заказа<input
        bind:value={query}
        maxlength="120"
        placeholder="Номер, имя или телефон"
      /></label
    ><button type="submit" disabled={loading}>Найти</button>
  </form>

  <div class="table-wrap" aria-busy={loading}>
    <table>
      <caption>Заказы — {total}</caption>
      <thead>
        <tr>
          <th>Номер</th><th>Создан</th><th>Получатель</th><th>Получение</th><th
            >Сумма</th
          ><th>Статус</th><th>Действие</th>
        </tr>
      </thead>
      <tbody>
        {#each orders as item (item.id)}
          <tr class:selected={order?.id === item.id}>
            <td><strong>{item.number}</strong></td>
            <td>{date.format(new Date(item.createdAt))}</td>
            <td>{item.recipientName}<br /><small>{item.phone}</small></td>
            <td>{methodLabel[item.deliveryMethod]}</td>
            <td
              >{formatMoney(
                item.totalMinor ?? item.itemsTotalMinor,
              )}{#if item.totalMinor === null}<br /><small>без доставки</small
                >{/if}</td
            >
            <td
              ><span class={`status ${item.status}`}
                >{statusLabel[item.status]}</span
              ></td
            >
            <td
              ><button onclick={() => open(item.id)} disabled={busy}
                >Открыть</button
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if !orders.length && !loading}<p>
      Заказов с таким статусом или по такому запросу нет.
    </p>{/if}
  {#if total > pageSize}
    <div class="pagination">
      <button
        disabled={page === 1 || loading}
        onclick={() => {
          page--;
          void load();
        }}>Назад</button
      ><span>{page} / {Math.ceil(total / pageSize)}</span><button
        disabled={page * pageSize >= total || loading}
        onclick={() => {
          page++;
          void load();
        }}>Далее</button
      >
    </div>
  {/if}

  {#if order}
    <article class="detail" aria-labelledby="order-heading">
      <header>
        <h3 id="order-heading" tabindex="-1">Заказ {order.number}</h3>
        <span class={`status ${order.status}`}>{statusLabel[order.status]}</span
        >
        <button class="close" onclick={() => (order = null)}>Закрыть</button>
      </header>
      <div class="columns">
        <dl>
          <dt>Получатель</dt>
          <dd>
            {order.recipientName},
            <a href={`tel:${order.phone}`}>{order.phone}</a>
          </dd>
          <dt>Получение</dt>
          <dd>
            {methodLabel[order.deliveryMethod]}{#if order.warehouse}: {order
                .warehouse.name}{/if}
          </dd>
          {#if order.address}
            <dt>Адрес</dt>
            <dd>
              {[order.postalCode, order.locality, order.address]
                .filter(Boolean)
                .join(', ')}
            </dd>
          {/if}
          {#if order.comment}
            <dt>Комментарий</dt>
            <dd>{order.comment}</dd>
          {/if}
          {#if order.trackingNumber}
            <dt>Трек-номер</dt>
            <dd>{order.trackingNumber}</dd>
          {/if}
          <dt>Оплата</dt>
          <dd>При получении</dd>
        </dl>
        <div>
          <table class="items">
            <caption class="visually-hidden">Товары заказа</caption>
            <thead><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th></tr></thead>
            <tbody>
              {#each order.items as line (line.variantId)}
                <tr>
                  <td
                    >{line.name}<br /><small
                      >{line.variantName}, {line.sku}</small
                    ></td
                  >
                  <td>{line.quantity}</td>
                  <td>{formatMoney(line.unitPriceMinor * line.quantity)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="sum">
            Товары {formatMoney(order.itemsTotalMinor)} · доставка {order.deliveryPriceMinor ===
            null
              ? 'не указана'
              : formatMoney(order.deliveryPriceMinor)}<br /><strong
              >Итого {formatMoney(
                order.totalMinor ?? order.itemsTotalMinor,
              )}</strong
            >
          </p>
        </div>
      </div>

      <ol class="history" aria-label="История">
        {#each order.history as step (step.at + step.status)}
          <li>
            <strong>{statusLabel[step.status]}</strong>
            {date.format(new Date(step.at))}
          </li>
        {/each}
      </ol>

      {#if canManage && !['completed', 'cancelled'].includes(order.status)}
        <div class="actions">
          {#if order.status === 'new'}
            {#if order.deliveryMethod !== 'pickup'}
              <label
                >Цена доставки, леев<input
                  bind:value={price}
                  inputmode="decimal"
                  placeholder="Не указана"
                /></label
              >
            {/if}
            <button
              class="button"
              onclick={() => move('confirmed')}
              disabled={busy}>Подтвердить</button
            >
          {:else if order.status === 'confirmed'}
            <button class="button" onclick={() => move('ready')} disabled={busy}
              >Собран</button
            >
          {:else if order.status === 'ready' && order.deliveryMethod === 'pickup'}
            <button
              class="button"
              onclick={() => move('completed')}
              disabled={busy}>Выдан покупателю</button
            >
          {:else if order.status === 'ready'}
            <label
              >Трек-номер <span>(необязательно)</span><input
                bind:value={tracking}
                maxlength="64"
              /></label
            >
            <button
              class="button"
              onclick={() => move('shipped')}
              disabled={busy}>Отправлен</button
            >
          {:else if order.status === 'shipped'}
            <button
              class="button"
              onclick={() => move('completed')}
              disabled={busy}>Доставлен</button
            >
          {/if}
          {#if ['new', 'confirmed', 'ready'].includes(order.status)}
            {#if confirmingCancel}
              <p class="warning">
                Отменить заказ? Отложенный товар вернётся в свободный остаток.
              </p>
              <button
                class="danger"
                onclick={() => move('cancelled')}
                disabled={busy}>Да, отменить</button
              >
              <button onclick={() => (confirmingCancel = false)} disabled={busy}
                >Не отменять</button
              >
            {:else}
              <button onclick={() => (confirmingCancel = true)} disabled={busy}
                >Отменить заказ</button
              >
            {/if}
          {/if}
        </div>
      {/if}
    </article>
  {/if}
</section>

<style>
  .orders {
    display: grid;
    gap: var(--space-md);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .filters button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border-radius: var(--radius-pill);
  }
  .filters button[aria-pressed='true'] {
    background: var(--color-ink);
    color: #ffffff;
  }
  .count {
    min-width: 1.5rem;
    padding: 0 0.4rem;
    border-radius: var(--radius-pill);
    background: var(--color-honey-soft);
    color: var(--color-ink);
    font-size: var(--text-sm);
    text-align: center;
  }
  .search {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm);
  }
  .search label {
    margin: 0;
  }
  .search button {
    min-height: 3.25rem;
  }
  .table-wrap {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  thead tr {
    border-bottom: 2px solid var(--color-ink);
  }
  th {
    color: var(--color-muted);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  th,
  td {
    padding: var(--space-sm);
    border-bottom: 1px solid var(--color-line);
    vertical-align: top;
  }
  caption {
    padding-block: var(--space-sm);
    text-align: left;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  tr.selected {
    background: var(--color-honey-soft);
  }
  small {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }
  .status {
    display: inline-block;
    padding: 0.1rem 0.6rem;
    border-radius: var(--radius-pill);
    background: var(--color-sand);
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
  }
  .status.new {
    background: var(--color-honey);
  }
  .status.cancelled {
    color: var(--color-muted);
  }
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-md);
  }
  .detail {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    border: 2px solid var(--color-ink);
    border-radius: var(--radius-lg);
    background: var(--color-paper);
  }
  .detail header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .detail h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: -0.03em;
  }
  .close {
    margin-left: auto;
  }
  .columns {
    display: grid;
    gap: var(--space-lg);
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-xs) var(--space-md);
    margin: 0;
  }
  dt {
    color: var(--color-muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .sum {
    margin: var(--space-sm) 0 0;
    text-align: right;
  }
  .history {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-lg);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--color-muted);
  }
  .history strong {
    color: var(--color-ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-line);
  }
  .actions label {
    margin: 0;
  }
  .actions label span {
    color: var(--color-muted);
    font-weight: 400;
  }
  .actions button {
    min-height: 3.25rem;
  }
  .warning {
    flex-basis: 100%;
    margin: 0;
    font-weight: 600;
  }
  .danger {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
  .error {
    color: var(--color-danger);
  }
  .notice {
    font-weight: 600;
  }
  @media (min-width: 64rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    }
  }
</style>
