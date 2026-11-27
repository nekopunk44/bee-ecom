<script lang="ts">
  import type { components } from '@bee/api-client';
  import HexBadge from './HexBadge.svelte';
  import Icon from './Icon.svelte';
  type Order = components['schemas']['AdminOrderSummary'];
  /**
   * Уведомления о новых заказах: сота с числом в шапке раздела. Пока новые есть,
   * вокруг неё расходится контур; по нажатию раскрывается список.
   */
  let {
    count,
    orders,
    onOpen,
  }: { count: number; orders: Order[]; onOpen: () => void } = $props();
  let open = $state(false);
  let root = $state<HTMLElement>();
  const money = new Intl.NumberFormat('ru-MD', { maximumFractionDigits: 0 });
  const time = new Intl.DateTimeFormat('ru-MD', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const way = { courier: 'курьер', pickup: 'самовывоз', post: 'почта' };
  const word = $derived(
    count % 10 === 1 && count % 100 !== 11
      ? 'новый заказ'
      : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)
        ? 'новых заказа'
        : 'новых заказов',
  );

  function outside(event: MouseEvent) {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }
  function key(event: KeyboardEvent) {
    if (open && event.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={outside} onkeydown={key} />

<div class="bell" bind:this={root}>
  <button
    type="button"
    class="trigger"
    class:fresh={count > 0}
    aria-expanded={open}
    aria-controls="new-orders"
    aria-label={count > 0 ? `Уведомления: ${count} ${word}` : 'Уведомления'}
    onclick={() => (open = !open)}
  >
    <HexBadge value={count} size="lg" tone={count > 0 ? 'honey' : 'muted'} />
  </button>
  {#if open}
    <section id="new-orders" class="panel-pop" aria-label="Уведомления">
      <h2>Уведомления</h2>
      {#if orders.length}
        <ul>
          {#each orders as order (order.id)}
            <li>
              <button
                type="button"
                onclick={() => {
                  open = false;
                  onOpen();
                }}
              >
                <HexBadge value="" size="md" />
                <span class="text">
                  <strong>Новый заказ {order.number}</strong>
                  <small
                    >{order.recipientName}, {way[order.deliveryMethod]}, {money.format(
                      (order.totalMinor ?? order.itemsTotalMinor) / 100,
                    )} L</small
                  >
                </span>
                <time datetime={order.createdAt}
                  >{time.format(new Date(order.createdAt))}</time
                >
              </button>
            </li>
          {/each}
        </ul>
        <button
          class="all"
          type="button"
          onclick={() => {
            open = false;
            onOpen();
          }}>Показать новые заказы <Icon name="arrow" size={16} /></button
        >
      {:else}
        <p class="empty">Новых заказов нет.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .bell {
    position: relative;
    flex: none;
  }
  .trigger {
    position: relative;
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.65rem;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .trigger:hover {
    transform: translateY(-2px);
  }
  /* Пока есть новые заказы, вокруг соты расходится медовый контур. */
  .fresh::before {
    position: absolute;
    inset: 0;
    background: var(--color-honey);
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    opacity: 0;
    content: '';
    animation: pulse 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }
  @keyframes pulse {
    0% {
      opacity: 0.45;
      scale: 1;
    }
    100% {
      opacity: 0;
      scale: 1.6;
    }
  }
  .panel-pop {
    position: absolute;
    z-index: 30;
    top: calc(100% + 0.6rem);
    right: 0;
    width: min(23.75rem, calc(100vw - 2rem));
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--color-paper);
    box-shadow:
      0 1.5rem 3.75rem rgb(23 21 15 / 22%),
      0 0 0 1px rgb(23 21 15 / 5%);
    animation: drop 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes drop {
    from {
      opacity: 0;
      translate: 0 -0.4rem;
    }
  }
  h2 {
    margin: 0;
    padding: 1rem 1.1rem 0.6rem;
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0 0.5rem 0.5rem;
    list-style: none;
  }
  li button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.6rem;
    border: 0;
    border-radius: 1rem;
    background: #fff8e1;
    color: var(--color-ink);
    text-align: left;
    cursor: pointer;
  }
  li button:hover {
    background: var(--color-honey-soft);
  }
  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .text small {
    overflow: hidden;
    color: var(--color-muted);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  time {
    color: var(--color-muted);
    font-size: 0.75rem;
    font-weight: 650;
  }
  .all {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    min-height: 2.9rem;
    border: 0;
    border-top: 1px solid var(--color-line);
    background: transparent;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
  }
  .all:hover {
    background: var(--color-sand);
  }
  .empty {
    margin: 0;
    padding: 0 1.1rem 1.1rem;
    color: var(--color-muted);
  }
  /* На телефоне о новых заказах говорит сота в нижнем меню. */
  @media (max-width: 47.99rem) {
    .bell {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fresh::before {
      animation: none;
    }
  }
</style>
