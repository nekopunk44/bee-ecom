<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { components } from '@bee/api-client';
  import { api, type Session } from './lib/catalog';
  import Icon from './components/Icon.svelte';
  import HexBadge from './components/HexBadge.svelte';
  import NewOrders from './components/NewOrders.svelte';
  import ServerStatus from './components/ServerStatus.svelte';
  import LoginForm from './components/LoginForm.svelte';
  import ConnectionCheck from './components/ConnectionCheck.svelte';
  import ProductsWorkspace from './components/ProductsWorkspace.svelte';
  import ReferenceEditor from './components/ReferenceEditor.svelte';
  import InventoryWorkspace from './components/InventoryWorkspace.svelte';
  import OrdersWorkspace from './components/OrdersWorkspace.svelte';

  type Section = 'products' | 'orders' | 'inventory' | 'references';
  let session = $state<Session | null>(null);
  // Сессия истекла посреди работы: вход поверх раздела, чтобы не потерять введённое.
  let needsLogin = $state(false);
  let checked = $state(false);
  let error = $state('');
  let section = $state<Section>('products');
  // Экран входа (или вход поверх раздела) и его уход после удачного входа.
  let screen = $state<HTMLElement>();
  let leaving = $state(false);
  // Админка открылась сразу после входа: панель и раздел въезжают.
  let entering = $state(false);
  let newOrders = $state(0);
  let newOrderList = $state<components['schemas']['AdminOrderSummary'][]>([]);
  const can = (permission: string) =>
    session?.permissions.includes(permission) ?? false;
  const sections = $derived(
    (
      [
        ['products', 'Товары', 'Товары', 'products', can('products.read')],
        ['orders', 'Заказы', 'Заказы', 'orders', can('orders.read')],
        [
          'inventory',
          'Склады и остатки',
          'Склады',
          'inventory',
          can('inventory.read'),
        ],
        [
          'references',
          'Справочники',
          'Справочники',
          'references',
          can('products.write'),
        ],
      ] as const
    ).filter(([, , , , allowed]) => allowed),
  );
  const store = location.origin.replace('-admin', '');

  /** Новые заказы для соты в меню и уведомлений: число и пять последних. */
  async function countOrders() {
    if (!can('orders.read')) return;
    try {
      const result = await api.GET('/api/v1/admin/orders', {
        params: { query: { status: 'new', limit: 5, offset: 0 } },
        signal: AbortSignal.timeout(10000),
      });
      newOrders = result.data?.counts.new ?? 0;
      newOrderList = result.data?.items ?? [];
    } catch {
      // Счётчик в меню необязателен.
    }
  }
  /** Карточка входа сворачивается в соту, экран гаснет, и только потом открывается админка. */
  async function leave() {
    // С экрана входа сота улетает в левый верхний угол, где сейчас появится знак
    // боковой панели; поверх раздела — просто сворачивается на месте.
    const card = screen?.querySelector('form')?.getBoundingClientRect();
    if (card && !session) {
      screen?.style.setProperty(
        '--cell-x',
        `${Math.round(40 - (card.left + card.width / 2))}px`,
      );
      screen?.style.setProperty(
        '--cell-y',
        `${Math.round(40 - (card.top + card.height / 2))}px`,
      );
    }
    leaving = true;
    await tick();
    const playing = (screen?.getAnimations({ subtree: true }) ?? [])
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().endTime !== Infinity,
      )
      .map((animation) => animation.finished);
    await Promise.race([
      Promise.allSettled(playing),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
    leaving = false;
  }
  /** signedIn — человек только что вошёл через форму, а не открыл админку с живой сессией. */
  async function current(signedIn = false) {
    try {
      const result = await api.GET('/api/v1/auth/session', {
        signal: AbortSignal.timeout(7000),
      });
      if (result.data) {
        if (signedIn) {
          await leave();
          entering = !session;
        }
        session = result.data;
        needsLogin = false;
        // Без доступа к каталогу открывается первый раздел, который сотруднику доступен.
        if (!sections.some(([key]) => key === section))
          section = sections[0]?.[0] ?? 'products';
        void countOrders();
      }
    } catch {
      error = 'API недоступно. Войти можно после восстановления подключения.';
    } finally {
      checked = true;
    }
  }
  async function logout() {
    try {
      const result = await api.POST('/api/v1/auth/logout', {
        signal: AbortSignal.timeout(7000),
      });
      if (result.error) return;
      session = null;
    } catch {
      error = 'Не удалось завершить сессию. Повторите выход.';
    }
  }
  function open(next: Section) {
    section = next;
    void countOrders();
  }
  onMount(() => {
    void current();
    // Новые заказы появляются без перезагрузки: раз в полминуты спрашиваем сервер.
    const timer = setInterval(() => {
      if (session && !document.hidden) void countOrders();
    }, 30000);
    return () => clearInterval(timer);
  });
</script>

{#snippet tools()}
  {#if can('orders.read')}<NewOrders
      count={newOrders}
      orders={newOrderList}
      onOpen={() => open('orders')}
    />{/if}
{/snippet}

<a class="skip-link" href="#main">Перейти к содержимому</a>
{#if !session}
  <main
    id="main"
    class="welcome"
    bind:this={screen}
    data-leaving={leaving ? '' : undefined}
  >
    <svg class="comb" aria-hidden="true">
      <defs>
        <pattern
          id="comb"
          width="56"
          height="97"
          patternUnits="userSpaceOnUse"
          patternTransform="scale(1.2)"
        >
          <path
            d="M28 0 56 16v32L28 64 0 48V16z M28 64v33 M0 97V81l28-17 28 17v16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#comb)" />
    </svg>
    <div class="welcome-inner">
      <p class="logo">
        <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true"
          ><polygon points="15,1 29,9 29,25 15,33 1,25 1,9" fill="#f5b700"
          ></polygon></svg
        >bee<span>управление</span>
      </p>
      {#if checked}
        <LoginForm
          title="Вход для сотрудников"
          {error}
          {leaving}
          onSignedIn={() => current(true)}
        />
      {/if}
      <ConnectionCheck tone="dark" />
    </div>
  </main>
{:else}
  <div class="shell" data-entering={entering ? '' : undefined}>
    <aside class="sidebar">
      <p class="logo">
        <svg width="24" height="27" viewBox="0 0 30 34" aria-hidden="true"
          ><polygon points="15,1 29,9 29,25 15,33 1,25 1,9" fill="#f5b700"
          ></polygon></svg
        >bee<span>управление</span>
      </p>
      <!-- На телефоне меню уезжает вниз и становится стеклянным «облаком». -->
      <nav aria-label="Разделы управления" data-admin-nav>
        {#each sections as [key, label, short, icon] (key)}
          <button
            type="button"
            aria-current={section === key ? 'page' : undefined}
            aria-label={label}
            onclick={() => open(key)}
          >
            <Icon name={icon} />
            <span class="long">{label}</span>
            <span class="short" aria-hidden="true">{short}</span>
            {#if key === 'orders' && newOrders > 0}<span class="count"
                ><HexBadge
                  value={newOrders}
                  size="md"
                  tone={section === key ? 'ink' : 'honey'}
                /></span
              >{/if}
          </button>
        {/each}
      </nav>
      <div class="sidebar-foot">
        <a class="store" href={store} target="_blank" rel="noopener"
          ><Icon name="store" size={18} />Открыть магазин</a
        >
        <div class="user">
          <span class="avatar" aria-hidden="true"
            >{session.email.charAt(0).toUpperCase()}</span
          >
          <span class="who">
            <span class="email">{session.email}</span>
            <ServerStatus />
          </span>
          <button
            class="logout"
            type="button"
            aria-label="Выйти"
            title="Выйти"
            onclick={logout}><Icon name="logout" size={18} /></button
          >
        </div>
      </div>
    </aside>
    <main id="main" class="content">
      {#if error}<p class="message error" role="alert">{error}</p>{/if}
      {#if section === 'products'}
        <ProductsWorkspace
          permissions={session.permissions}
          onExpired={() => (needsLogin = true)}
          {tools}
        />
      {:else if section === 'orders'}
        <OrdersWorkspace
          permissions={session.permissions}
          onExpired={() => (needsLogin = true)}
          onChanged={() => void countOrders()}
          {tools}
        />
      {:else if section === 'inventory'}
        <InventoryWorkspace
          permissions={session.permissions}
          onExpired={() => (needsLogin = true)}
          {tools}
        />
      {:else}
        <ReferenceEditor onExpired={() => (needsLogin = true)} {tools} />
      {/if}
    </main>
  </div>
  {#if needsLogin}
    <div
      class="relogin"
      role="dialog"
      aria-modal="true"
      aria-label="Войти снова"
      bind:this={screen}
      data-leaving={leaving ? '' : undefined}
    >
      <LoginForm
        title="Войти снова"
        {leaving}
        onSignedIn={() => current(true)}
      />
    </div>
  {/if}
{/if}

<style>
  .logo {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 1;
    color: #ffffff;
  }
  .logo span {
    margin-left: 0.2rem;
    font-family: var(--font-body);
    font-size: 0.9375rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--color-night-muted);
  }

  /* Вход: графитовый экран с сотами, форма посередине. */
  .welcome {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: var(--space-lg) var(--space-md);
    overflow: hidden;
    background: var(--color-night);
  }
  .comb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: var(--color-night-line);
    opacity: 0.6;
    animation: comb-in 1200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  /* Соты фона проступают и чуть оседают, знак докручивается на место. */
  @keyframes comb-in {
    from {
      opacity: 0;
      scale: 1.08;
    }
  }
  .welcome .logo svg {
    animation: cell-mark-in 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  /* После входа экран гаснет, пока карточка сворачивается в соту. */
  .welcome[data-leaving],
  .relogin[data-leaving] {
    animation: cell-fade-out 320ms cubic-bezier(0.4, 0, 0.6, 1) 140ms both;
  }
  .welcome-inner {
    position: relative;
    display: grid;
    justify-items: center;
    gap: var(--space-lg);
    width: min(26rem, 100%);
  }

  /* Боковая панель: графит, разделы с иконками, внизу магазин и сотрудник. */
  .sidebar {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    height: 100vh;
    padding: 1.75rem 1rem 1.25rem;
    background: var(--color-night);
    color: var(--color-night-text);
    --color-focus: var(--color-honey);
  }
  .sidebar .logo {
    padding: 0 0.5rem;
  }
  nav {
    display: grid;
    gap: 0.25rem;
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border: 0;
    border-radius: 0.875rem;
    background: transparent;
    color: var(--color-night-text);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  nav button:hover {
    background: var(--color-night-raised);
    color: #ffffff;
  }
  nav button[aria-current] {
    background: var(--color-honey);
    color: var(--color-ink);
    font-weight: 700;
  }
  nav .long {
    flex: 1;
  }
  nav .short {
    display: none;
  }
  .count {
    display: inline-flex;
  }
  .sidebar-foot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.875rem;
    margin-top: auto;
  }
  .store {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 0.75rem;
    color: var(--color-night-muted);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }
  .store:hover {
    color: #ffffff;
  }
  .user {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.875rem 0.5rem 0 0.75rem;
    border-top: 1px solid var(--color-night-line);
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--color-night-raised);
    color: var(--color-honey);
    font-weight: 800;
  }
  .who {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .email {
    overflow: hidden;
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .logout {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-night-muted);
    cursor: pointer;
  }
  .logout:hover {
    background: var(--color-night-raised);
    color: #ffffff;
  }
  .relogin {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: var(--space-md);
    background: rgb(23 21 15 / 55%);
    animation: cell-fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  /* Сразу после входа панель выезжает слева, а раздел поднимается следом. */
  .shell[data-entering] .sidebar {
    animation: sidebar-in 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .shell[data-entering] .content {
    animation: cell-content-in 560ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both;
  }
  @keyframes sidebar-in {
    from {
      translate: -100% 0;
    }
  }

  /* Телефон и планшет: сверху скруглённая графитовая капсула с логотипом и
     сотрудником, меню — стеклянное «облако» внизу экрана. */
  @media (max-width: 63.99rem) {
    .sidebar {
      position: sticky;
      z-index: 20;
      top: 0.625rem;
      flex-direction: row;
      align-items: center;
      gap: 0.75rem;
      height: auto;
      margin: 0.625rem 0.625rem 0;
      padding: 0.5rem 0.5rem 0.5rem 0.875rem;
      border-radius: 1.75rem;
      box-shadow: 0 0.625rem 1.5rem rgb(23 21 15 / 18%);
    }
    .sidebar .logo {
      padding: 0;
      font-size: 1.3rem;
    }
    .sidebar .logo svg {
      width: 22px;
      height: 25px;
    }
    nav {
      position: fixed;
      z-index: 40;
      right: 0.75rem;
      bottom: 1rem;
      left: 0.75rem;
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      gap: 0.25rem;
      padding: 0.375rem;
      overflow: hidden;
      border: 1px solid rgb(255 255 255 / 75%);
      border-radius: 1.875rem;
      background: rgb(255 255 255 / 42%);
      backdrop-filter: blur(22px) saturate(180%);
      -webkit-backdrop-filter: blur(22px) saturate(180%);
      box-shadow:
        0 1.125rem 2.5rem rgb(23 21 15 / 22%),
        0 0.125rem 0.375rem rgb(23 21 15 / 8%),
        inset 0 1px 0 rgb(255 255 255 / 95%);
    }
    /* Блик сверху, как на зеркале. */
    nav::before {
      position: absolute;
      inset: 0 0 45%;
      background: linear-gradient(
        180deg,
        rgb(255 255 255 / 70%),
        rgb(255 255 255 / 0%)
      );
      content: '';
      pointer-events: none;
    }
    nav button {
      position: relative;
      flex-direction: column;
      justify-content: center;
      gap: 0.2rem;
      min-height: 3.5rem;
      padding: 0.4rem 0;
      border-radius: 1.5rem;
      color: var(--color-ink);
      font-size: 0.75rem;
    }
    nav button:hover {
      background: rgb(255 255 255 / 55%);
      color: var(--color-ink);
    }
    nav button[aria-current] {
      background: var(--color-ink);
      color: #ffffff;
      box-shadow: 0 0.375rem 0.875rem rgb(23 21 15 / 30%);
    }
    nav button[aria-current] :global(svg) {
      color: var(--color-honey);
    }
    nav .long {
      display: none;
    }
    nav .short {
      display: block;
    }
    .count {
      position: absolute;
      top: 0.15rem;
      left: calc(50% + 0.35rem);
    }
    .sidebar-foot {
      display: flex;
      align-items: center;
      margin: 0 0 0 auto;
    }
    .store,
    .who {
      display: none;
    }
    .user {
      padding: 0;
      border: 0;
    }
    .content {
      padding-bottom: 7rem;
    }
  }
</style>
