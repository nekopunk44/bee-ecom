<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, type Session } from './lib/catalog';
  import Icon from './components/Icon.svelte';
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
  const can = (permission: string) =>
    session?.permissions.includes(permission) ?? false;
  const sections = $derived(
    (
      [
        ['products', 'Товары', 'products', can('products.read')],
        ['orders', 'Заказы', 'orders', can('orders.read')],
        ['inventory', 'Склады и остатки', 'inventory', can('inventory.read')],
        ['references', 'Справочники', 'references', can('products.write')],
      ] as const
    ).filter(([, , , allowed]) => allowed),
  );
  const store = location.origin.replace('-admin', '');

  async function countOrders() {
    if (!can('orders.read')) return;
    try {
      const result = await api.GET('/api/v1/admin/orders', {
        params: { query: { status: 'new', limit: 1, offset: 0 } },
        signal: AbortSignal.timeout(10000),
      });
      newOrders = result.data?.counts.new ?? 0;
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
  onMount(() => void current());
</script>

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
      <nav aria-label="Разделы управления" data-admin-nav>
        {#each sections as [key, label, icon] (key)}
          <button
            type="button"
            aria-current={section === key ? 'page' : undefined}
            onclick={() => open(key)}
          >
            <Icon name={icon} />
            <span>{label}</span>
            {#if key === 'orders' && newOrders > 0}<b>{newOrders}</b>{/if}
          </button>
        {/each}
      </nav>
      <div class="sidebar-foot">
        <a class="store" href={store} target="_blank" rel="noopener"
          ><Icon name="store" size={18} />Открыть магазин</a
        >
        <ConnectionCheck tone="dark" />
        <div class="user">
          <span class="avatar" aria-hidden="true"
            >{session.email.charAt(0).toUpperCase()}</span
          >
          <span class="email">{session.email}</span>
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
        />
      {:else if section === 'orders'}
        <OrdersWorkspace
          permissions={session.permissions}
          onExpired={() => (needsLogin = true)}
          onChanged={() => void countOrders()}
        />
      {:else if section === 'inventory'}
        <InventoryWorkspace
          permissions={session.permissions}
          onExpired={() => (needsLogin = true)}
        />
      {:else}
        <ReferenceEditor onExpired={() => (needsLogin = true)} />
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

  /* Боковая панель. */
  .sidebar {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    height: 100vh;
    padding: var(--space-lg) var(--space-md) var(--space-md);
    background: var(--color-night);
    color: var(--color-night-text);
    --color-focus: var(--color-honey);
  }
  nav {
    display: grid;
    gap: 0.2rem;
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0 0.8rem;
    border: 0;
    border-radius: 0.85rem;
    background: transparent;
    color: var(--color-night-text);
    font-weight: 600;
    text-align: left;
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
  }
  nav span {
    flex: 1;
  }
  nav b {
    min-width: 1.4rem;
    padding: 0.05rem 0.4rem;
    border-radius: var(--radius-pill);
    background: var(--color-honey);
    color: var(--color-ink);
    font-size: 0.75rem;
    text-align: center;
  }
  nav button[aria-current] b {
    background: var(--color-ink);
    color: var(--color-honey);
  }
  .sidebar-foot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-md);
    margin-top: auto;
  }
  .store {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
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
    padding-top: var(--space-md);
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
  .email {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 0.8125rem;
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

  /* На узком экране панель — полоса сверху, разделы прокручиваются вбок. */
  @media (max-width: 63.99rem) {
    .sidebar {
      position: static;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm) var(--space-md);
      height: auto;
      padding: var(--space-sm) var(--space-md);
    }
    nav {
      display: flex;
      order: 3;
      width: 100%;
      overflow-x: auto;
    }
    nav button {
      width: auto;
      white-space: nowrap;
    }
    .sidebar-foot {
      display: flex;
      align-items: center;
      margin: 0 0 0 auto;
    }
    .sidebar-foot .store,
    .sidebar-foot :global(details),
    .email {
      display: none;
    }
    .user {
      padding: 0;
      border: 0;
    }
  }
</style>
