<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { components } from '@bee/api-client';
  import { api, errorText } from '../lib/catalog';
  import Drawer from './Drawer.svelte';
  import Icon from './Icon.svelte';

  type Summary = components['schemas']['AdminOrderSummary'];
  type Order = components['schemas']['Order'];
  type Status = Order['status'];
  type Change = components['schemas']['OrderStatusChange'];
  let {
    permissions,
    onExpired,
    onChanged,
    tools,
  }: {
    permissions: string[];
    onExpired: () => void;
    onChanged?: () => void;
    tools?: Snippet;
  } = $props();

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
  // Новый заказ ждёт действия — медовая метка; отменённый бледнее остальных.
  const tone: Record<Status, string> = {
    new: 'honey',
    confirmed: '',
    ready: '',
    shipped: '',
    completed: 'ink',
    cancelled: 'faded',
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
      onChanged?.();
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

<header class="page-head">
  <div>
    <h1 id="orders-heading">Заказы</h1>
    <p>
      {filter ? filterLabel[filter] : 'Все'}: {total}
    </p>
  </div>
  <div class="page-actions">
    <form
      class="search-box"
      role="search"
      onsubmit={(event) => {
        event.preventDefault();
        page = 1;
        void load();
      }}
    >
      <Icon name="search" size={18} />
      <input
        bind:value={query}
        type="search"
        maxlength="120"
        placeholder="Номер, имя или телефон"
        aria-label="Поиск заказа"
      />
    </form>
    {@render tools?.()}
  </div>
</header>

{#if error && !order}<p role="alert" class="message error">{error}</p>{/if}
{#if notice && !order}<p role="status" class="message">{notice}</p>{/if}

<div class="segmented filters" role="group" aria-label="Статус заказов">
  <button
    type="button"
    aria-pressed={filter === ''}
    onclick={() => choose('')}
    disabled={loading}>Все</button
  >
  {#each statuses as status (status)}
    <button
      type="button"
      aria-pressed={filter === status}
      onclick={() => choose(status)}
      disabled={loading}
      >{filterLabel[status]}{#if counts}<span class="count"
          >{counts[status]}</span
        >{/if}</button
    >
  {/each}
</div>

<section
  class="panel flush"
  aria-labelledby="orders-heading"
  aria-busy={loading}
>
  <div class="table-wrap">
    <table class="data">
      <caption class="visually-hidden">Заказы — {total}</caption>
      <thead>
        <tr>
          <th>Номер</th><th class="wide-only">Создан</th><th>Получатель</th><th
            class="wide-only">Получение</th
          ><th class="num">Сумма</th><th>Статус</th><th
            ><span class="visually-hidden">Действие</span></th
          >
        </tr>
      </thead>
      <tbody>
        {#each orders as item (item.id)}
          <tr class:selected={order?.id === item.id}>
            <td><strong>{item.number}</strong></td>
            <td class="muted wide-only"
              >{date.format(new Date(item.createdAt))}</td
            >
            <td
              ><span class="cell-main"
                ><span>{item.recipientName}</span><small class="muted"
                  >{item.phone}</small
                ></span
              ></td
            >
            <td class="wide-only">{methodLabel[item.deliveryMethod]}</td>
            <td class="num"
              ><span class="cell-main"
                ><span
                  >{formatMoney(item.totalMinor ?? item.itemsTotalMinor)}</span
                >{#if item.totalMinor === null}<small class="muted"
                    >без доставки</small
                  >{/if}</span
              ></td
            >
            <td
              ><span class="badge {tone[item.status]}"
                >{statusLabel[item.status]}</span
              ></td
            >
            <td class="action"
              ><button
                class="btn small"
                type="button"
                onclick={() => open(item.id)}
                disabled={busy}>Открыть<Icon name="arrow" size={16} /></button
              ></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if !orders.length && !loading}<p class="empty">
      Заказов с таким статусом или по такому запросу нет.
    </p>{/if}
  {#if total > pageSize}
    <div class="pager">
      <span>Страница {page} из {Math.ceil(total / pageSize)}</span>
      <div>
        <button
          class="btn small"
          type="button"
          disabled={page === 1 || loading}
          onclick={() => {
            page--;
            void load();
          }}>Назад</button
        ><button
          class="btn small"
          type="button"
          disabled={page * pageSize >= total || loading}
          onclick={() => {
            page++;
            void load();
          }}>Далее</button
        >
      </div>
    </div>
  {/if}
</section>

{#if order}
  <Drawer title={`Заказ ${order.number}`} onClose={() => (order = null)}>
    {#if error}<p role="alert" class="message error">{error}</p>{/if}
    {#if notice}<p role="status" class="message">{notice}</p>{/if}
    <article class="detail" aria-label="Карточка заказа">
      <div class="status-line">
        <span class="badge {tone[order.status]}"
          >{statusLabel[order.status]}</span
        >
        <span class="muted">{date.format(new Date(order.createdAt))}</span>
      </div>
      <section class="panel">
        <h3 class="panel-title">Покупатель и получение</h3>
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
      </section>
      <section class="panel">
        <h3 class="panel-title">Товары</h3>
        <table class="data items">
          <caption class="visually-hidden">Товары заказа</caption>
          <thead
            ><tr
              ><th>Товар</th><th class="num">Кол-во</th><th class="num"
                >Сумма</th
              ></tr
            ></thead
          >
          <tbody>
            {#each order.items as line (line.variantId)}
              <tr>
                <td
                  ><span class="cell-main"
                    ><span>{line.name}</span><small class="muted"
                      >{line.variantName}, {line.sku}</small
                    ></span
                  ></td
                >
                <td class="num">{line.quantity}</td>
                <td class="num"
                  >{formatMoney(line.unitPriceMinor * line.quantity)}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
        <dl class="sum">
          <dt>Товары</dt>
          <dd>{formatMoney(order.itemsTotalMinor)}</dd>
          <dt>Доставка</dt>
          <dd>
            {order.deliveryPriceMinor === null
              ? 'не указана'
              : formatMoney(order.deliveryPriceMinor)}
          </dd>
          <dt class="total">Итого</dt>
          <dd class="total">
            {formatMoney(order.totalMinor ?? order.itemsTotalMinor)}
          </dd>
        </dl>
      </section>
      <section class="panel">
        <h3 class="panel-title">История</h3>
        <ol class="history" aria-label="История">
          {#each order.history as step (step.at + step.status)}
            <li>
              <strong>{statusLabel[step.status]}</strong>
              <span class="muted">{date.format(new Date(step.at))}</span>
            </li>
          {/each}
        </ol>
      </section>
    </article>

    {#if canManage && !['completed', 'cancelled'].includes(order.status)}
      <section class="panel actions">
        <h3 class="panel-title">Следующий шаг</h3>
        <div class="action-row">
          {#if order.status === 'new'}
            {#if order.deliveryMethod !== 'pickup'}
              <label class="field"
                >Цена доставки, леев<input
                  bind:value={price}
                  inputmode="decimal"
                  placeholder="Не указана"
                /></label
              >
            {/if}
            <button
              class="btn primary"
              type="button"
              onclick={() => move('confirmed')}
              disabled={busy}>Подтвердить</button
            >
          {:else if order.status === 'confirmed'}
            <button
              class="btn primary"
              type="button"
              onclick={() => move('ready')}
              disabled={busy}>Собран</button
            >
          {:else if order.status === 'ready' && order.deliveryMethod === 'pickup'}
            <button
              class="btn primary"
              type="button"
              onclick={() => move('completed')}
              disabled={busy}>Выдан покупателю</button
            >
          {:else if order.status === 'ready'}
            <label class="field"
              >Трек-номер <span class="hint">(необязательно)</span><input
                bind:value={tracking}
                maxlength="64"
              /></label
            >
            <button
              class="btn primary"
              type="button"
              onclick={() => move('shipped')}
              disabled={busy}>Отправлен</button
            >
          {:else if order.status === 'shipped'}
            <button
              class="btn primary"
              type="button"
              onclick={() => move('completed')}
              disabled={busy}>Доставлен</button
            >
          {/if}
        </div>
        {#if ['new', 'confirmed', 'ready'].includes(order.status)}
          <div class="cancel">
            {#if confirmingCancel}
              <p class="warning">
                Отменить заказ? Отложенный товар вернётся в свободный остаток.
              </p>
              <button
                class="btn danger"
                type="button"
                onclick={() => move('cancelled')}
                disabled={busy}>Да, отменить</button
              >
              <button
                class="btn quiet"
                type="button"
                onclick={() => (confirmingCancel = false)}
                disabled={busy}>Не отменять</button
              >
            {:else}
              <button
                class="btn quiet"
                type="button"
                onclick={() => (confirmingCancel = true)}
                disabled={busy}>Отменить заказ</button
              >
            {/if}
          </div>
        {/if}
      </section>
    {/if}
  </Drawer>
{/if}

<style>
  .filters {
    margin-bottom: var(--space-md);
  }
  .action {
    text-align: right;
  }
  .detail {
    display: grid;
    gap: var(--space-md);
  }
  .detail .panel + .panel {
    margin-top: 0;
  }
  .status-line {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.875rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.45rem var(--space-md);
    margin: 0;
    font-size: 0.9375rem;
  }
  dt {
    color: var(--color-muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .items th:first-child,
  .items td:first-child {
    padding-left: 0;
  }
  .items th:last-child,
  .items td:last-child {
    padding-right: 0;
  }
  .sum {
    grid-template-columns: minmax(0, 1fr) max-content;
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--color-line);
  }
  .sum dd {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .sum .total {
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 800;
  }
  .history {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0 0 0 1.1rem;
    border-left: 2px solid var(--color-honey);
    list-style: none;
  }
  .history li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .actions {
    margin-top: var(--space-md);
    border: 2px solid var(--color-ink);
  }
  .action-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm);
  }
  .action-row .field {
    flex: 1 1 12rem;
  }
  .action-row :global(.btn) {
    min-height: 2.625rem;
  }
  .cancel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--color-line);
  }
  .warning {
    flex-basis: 100%;
    margin: 0;
    font-weight: 600;
  }
</style>
