<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorText, type Product, type Metadata } from '../lib/catalog';
  import Icon from './Icon.svelte';
  import ProductEditor from './ProductEditor.svelte';
  let {
    permissions,
    onExpired,
  }: { permissions: string[]; onExpired: () => void } = $props();
  const pageSize = 12;
  let products = $state<Product[]>([]);
  let metadata = $state<Metadata>({
    categories: [],
    brands: [],
    attributes: [],
  });
  let page = $state(1);
  let total = $state(0);
  let query = $state('');
  let loading = $state(false);
  let error = $state('');
  let notice = $state('');
  let editing = $state<Product | null | undefined>(undefined);
  let editKey = $state(0);
  const canWrite = $derived(permissions.includes('products.write'));
  const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const money = new Intl.NumberFormat('ru-MD', {
    maximumFractionDigits: 0,
  });
  const status = {
    active: ['Опубликован', 'honey'],
    draft: ['Черновик', ''],
    archived: ['Архив', 'faded'],
  } as const;

  async function load() {
    loading = true;
    error = '';
    try {
      const [list, refs] = await Promise.all([
        api.GET('/api/v1/admin/products', {
          params: { query: { locale: 'ru', q: query, page, limit: pageSize } },
          signal: AbortSignal.timeout(10000),
        }),
        api.GET('/api/v1/catalog/metadata', {
          params: { query: { locale: 'ru' } },
          signal: AbortSignal.timeout(10000),
        }),
      ]);
      if (list.response.status === 401) onExpired();
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
  onMount(() => void load());

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
  const category = (product: Product) =>
    metadata.categories.find((c) => c.id === product.categoryIds[0])?.name ??
    '';
  function price(product: Product) {
    const values = product.variants.map((v) => v.priceMinor / 100);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return low === high
      ? `${money.format(low)} L`
      : `${money.format(low)}–${money.format(high)} L`;
  }
</script>

<header class="page-head">
  <div>
    <h1>Товары</h1>
    <p>{total} в каталоге</p>
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
        maxlength="200"
        placeholder="Найти по названию"
        aria-label="Поиск товаров"
      />
    </form>
    {#if canWrite}<button
        class="btn primary"
        type="button"
        onclick={() => edit(null)}
        disabled={loading}><Icon name="plus" size={18} />Новый товар</button
      >{/if}
  </div>
</header>

{#if error}<p role="alert" class="message error">{error}</p>{/if}
{#if notice}<p role="status" class="message">{notice}</p>{/if}

<section class="panel flush" aria-busy={loading}>
  <div class="table-wrap">
    <table class="data">
      <caption class="visually-hidden">Товары — {total}</caption>
      <thead>
        <tr>
          <th>Товар</th>
          <th class="wide-only">Категория</th>
          <th class="num">Цена</th>
          <th class="num wide-only">Варианты</th>
          <th>Статус</th>
          <th><span class="visually-hidden">Действие</span></th>
        </tr>
      </thead>
      <tbody>
        {#each products as product (product.id)}
          <tr>
            <td>
              <div class="product">
                {#if product.images[0]}<img
                    src={product.images[0].url}
                    alt=""
                    width="48"
                    height="48"
                  />{:else}<span class="thumb" aria-hidden="true"
                    ><Icon name="image" size={18} /></span
                  >{/if}
                <span class="cell-main">
                  <strong>{product.translations.ru.name}</strong>
                  <small class="muted">{product.slug}</small>
                </span>
              </div>
            </td>
            <td class="muted wide-only">{category(product)}</td>
            <td class="num">{price(product)}</td>
            <td class="num wide-only">{product.variants.length}</td>
            <td
              ><span class="badge {status[product.status][1]}"
                >{status[product.status][0]}</span
              ></td
            >
            <td class="action">
              {#if canWrite}<button
                  class="btn small"
                  type="button"
                  onclick={() => edit(product)}
                  ><Icon name="edit" size={16} />Редактировать</button
                >{:else}<span class="muted">Просмотр</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if !products.length && !loading}<p class="empty">
      Товаров пока нет или поиск не дал результатов.
    </p>{/if}
  <div class="pager">
    <span>Страница {page} из {pages}</span>
    <div>
      <button
        class="btn small"
        type="button"
        disabled={page === 1 || loading}
        onclick={() => {
          page--;
          void load();
        }}>Назад</button
      >
      <button
        class="btn small"
        type="button"
        disabled={page >= pages || loading}
        onclick={() => {
          page++;
          void load();
        }}>Далее</button
      >
    </div>
  </div>
</section>

{#if editing !== undefined}
  {#key editKey}
    <ProductEditor
      product={editing}
      {metadata}
      onSaved={() => void saved()}
      onCancel={() => (editing = undefined)}
      {onExpired}
    />
  {/key}
{/if}

<style>
  .product {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 16rem;
  }
  .product img,
  .thumb {
    flex: none;
    width: 3rem;
    height: 3rem;
    border-radius: 0.7rem;
    background: var(--color-sand);
    object-fit: cover;
  }
  .thumb {
    display: grid;
    place-items: center;
    color: var(--color-muted);
  }
  .action {
    text-align: right;
  }
</style>
