<script lang="ts">
  import { onMount } from 'svelte';
  import {
    api,
    errorText,
    type Product,
    type Metadata,
    type Session,
  } from '../lib/catalog';
  import ProductEditor from './ProductEditor.svelte';
  import ReferenceEditor from './ReferenceEditor.svelte';
  let session = $state<Session | null>(null);
  let needsLogin = $state(false);
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');
  let notice = $state('');
  let products = $state<Product[]>([]);
  let metadata = $state<Metadata>({
    categories: [],
    brands: [],
    attributes: [],
  });
  let page = $state(1);
  let total = $state(0);
  let query = $state('');
  let tab = $state<'products' | 'references'>('products');
  let editing = $state<Product | null | undefined>(undefined);
  let editKey = $state(0);
  const canWrite = $derived(
    session?.permissions.includes('products.write') ?? false,
  );
  async function load() {
    loading = true;
    error = '';
    try {
      const [list, refs] = await Promise.all([
        api.GET('/api/v1/admin/products', {
          params: { query: { locale: 'ru', q: query, page, limit: 12 } },
          signal: AbortSignal.timeout(10000),
        }),
        api.GET('/api/v1/catalog/metadata', {
          params: { query: { locale: 'ru' } },
          signal: AbortSignal.timeout(10000),
        }),
      ]);
      if (list.response.status === 401) needsLogin = true;
      if (list.error || refs.error) {
        error = errorText(list.error?.error.code ?? refs.error?.error.code);
        return;
      }
      products = list.data.items;
      total = list.data.total;
      metadata = refs.data;
    } catch {
      error = errorText();
    } finally {
      loading = false;
    }
  }
  async function current() {
    try {
      const result = await api.GET('/api/v1/auth/session', {
        signal: AbortSignal.timeout(7000),
      });
      if (result.data) {
        session = result.data;
        needsLogin = false;
        await load();
      }
    } catch {
      error = 'API недоступно. Войти можно после восстановления подключения.';
    }
  }
  onMount(() => {
    void current();
  });
  async function login(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    error = '';
    try {
      const result = await api.POST('/api/v1/auth/login', {
        body: { email, password },
        signal: AbortSignal.timeout(10000),
      });
      password = '';
      if (result.error) error = errorText(result.error.error.code);
      else await current();
    } catch {
      error = errorText();
    } finally {
      loading = false;
    }
  }
  async function logout() {
    loading = true;
    error = '';
    try {
      const result = await api.POST('/api/v1/auth/logout', {
        signal: AbortSignal.timeout(7000),
      });
      if (result.error) {
        error = errorText(result.error.error.code);
        return;
      }
      session = null;
      editing = undefined;
      products = [];
    } catch {
      error = 'Не удалось завершить сессию. Повторите выход.';
    } finally {
      loading = false;
    }
  }
  function edit(product: Product | null) {
    editing = product;
    editKey++;
    notice = '';
  }
  async function saved() {
    editing = undefined;
    notice = 'Товар сохранён.';
    await load();
  }
</script>

<section class="workspace" aria-label="Управление каталогом">
  {#if error}<p role="alert" class="error">{error}</p>{/if}{#if notice}<p
      role="status"
    >
      {notice}
    </p>{/if}
  {#if !session || needsLogin}<form class="login" onsubmit={login}>
      <h2>{needsLogin ? 'Войти снова' : 'Вход для сотрудников'}</h2>
      <p>Доступ предоставляется администратором магазина.</p>
      <label
        >Электронная почта<input
          required
          type="email"
          autocomplete="username"
          bind:value={email}
        /></label
      ><label
        >Пароль<input
          required
          type="password"
          autocomplete="current-password"
          bind:value={password}
        /></label
      ><button class="button" disabled={loading}
        >{loading ? 'Подключаемся…' : 'Войти'}</button
      >
    </form>{/if}
  {#if session}<div class="toolbar">
      <p>{session.email}</p>
      <button onclick={logout} disabled={loading}>Выйти</button>
    </div>
    <nav class="tabs" aria-label="Разделы управления">
      <button
        aria-current={tab === 'products' ? 'page' : undefined}
        onclick={() => (tab = 'products')}>Товары</button
      >{#if canWrite}<button
          aria-current={tab === 'references' ? 'page' : undefined}
          onclick={() => (tab = 'references')}>Справочники</button
        >{/if}
    </nav>
    {#if tab === 'products'}<div class="toolbar">
        <form
          class="search"
          onsubmit={(e) => {
            e.preventDefault();
            page = 1;
            void load();
          }}
        >
          <label
            >Поиск товаров<input
              bind:value={query}
              maxlength="200"
              placeholder="Название"
            /></label
          ><button type="submit" disabled={loading}>Найти</button>
        </form>
        {#if canWrite}<button
            class="button"
            onclick={() => edit(null)}
            disabled={loading}>Новый товар</button
          >{/if}
      </div>
      {#if editing !== undefined}{#key editKey}<ProductEditor
            product={editing}
            {metadata}
            onSaved={() => void saved()}
            onCancel={() => (editing = undefined)}
            onExpired={() => (needsLogin = true)}
          />{/key}{/if}
      <div class="table-wrap" aria-busy={loading}>
        <table>
          <caption>Товары — {total}</caption><thead
            ><tr
              ><th>Название</th><th>Адрес</th><th>Статус</th><th>Варианты</th
              ><th>Действие</th></tr
            ></thead
          ><tbody
            >{#each products as product}<tr
                ><td>{product.translations.ru.name}</td><td>{product.slug}</td
                ><td
                  >{product.status === 'active'
                    ? 'Опубликован'
                    : product.status === 'draft'
                      ? 'Черновик'
                      : 'Архив'}</td
                ><td>{product.variants.length}</td><td
                  >{#if canWrite}<button onclick={() => edit(product)}
                      >Редактировать</button
                    >{:else}Просмотр{/if}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
      {#if !products.length && !loading}<p>
          Товаров пока нет или поиск не дал результатов.
        </p>{/if}
      <div class="pagination">
        <button
          disabled={page === 1 || loading}
          onclick={() => {
            page--;
            void load();
          }}>Назад</button
        ><span>{page} / {Math.max(1, Math.ceil(total / 12))}</span><button
          disabled={page * 12 >= total || loading}
          onclick={() => {
            page++;
            void load();
          }}>Далее</button
        >
      </div>
    {:else}<ReferenceEditor {metadata} onSaved={() => void load()} />{/if}{/if}
</section>

<style>
  .workspace {
    margin-block: var(--space-xl);
  }
  .login {
    max-width: 30rem;
    padding: var(--space-lg);
    border: 1px solid var(--color-line);
    background: var(--color-surface);
    border-radius: var(--radius-md);
  }
  .toolbar,
  .search,
  .tabs,
  .pagination {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    align-items: center;
    justify-content: space-between;
  }
  .tabs {
    justify-content: flex-start;
    border-bottom: 1px solid var(--color-line);
    padding-bottom: var(--space-md);
  }
  .tabs button[aria-current] {
    background: var(--color-forest);
    color: var(--color-surface);
  }
  .table-wrap {
    overflow: auto;
    margin-block: var(--space-lg);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th,
  td {
    padding: var(--space-sm);
    border-bottom: 1px solid var(--color-line);
  }
  caption {
    text-align: left;
    padding-block: var(--space-md);
  }
  .pagination {
    justify-content: center;
  }
  .error {
    color: var(--color-danger);
  }
</style>
