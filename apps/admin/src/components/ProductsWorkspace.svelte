<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { api, errorText, type Product, type Metadata } from '../lib/catalog';
  import Icon from './Icon.svelte';
  import ChipSelect from './ChipSelect.svelte';
  import Pager from './Pager.svelte';
  import ProductEditor from './ProductEditor.svelte';
  let {
    permissions,
    onExpired,
    tools,
  }: {
    permissions: string[];
    onExpired: () => void;
    // Сота уведомлений о новых заказах из оболочки админки.
    tools?: Snippet;
  } = $props();
  type Status = '' | 'active' | 'draft' | 'archived';
  type Sort = 'newest' | 'price_asc' | 'price_desc' | 'name';
  // Восемь строк на странице: переключатель из трёх кнопок охватывает два десятка товаров.
  const pageSize = 8;
  // Сколько штук считается «мало».
  const low = 5;
  let products = $state<Product[]>([]);
  let metadata = $state<Metadata>({
    categories: [],
    brands: [],
    attributes: [],
  });
  let page = $state(1);
  let total = $state(0);
  let query = $state('');
  let status = $state<Status>('');
  let category = $state('');
  let brand = $state('');
  let sort = $state<Sort>('newest');
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
  const tabs: [Status, string][] = [
    ['', 'Все'],
    ['active', 'На витрине'],
    ['draft', 'Черновики'],
    ['archived', 'Архив'],
  ];
  const statusLabel = {
    active: 'На витрине',
    draft: 'Черновик',
    archived: 'Архив',
  } as const;
  const sorts: { value: Sort; label: string }[] = [
    { value: 'newest', label: 'Сначала новые' },
    { value: 'name', label: 'По названию' },
    { value: 'price_asc', label: 'Сначала дешевле' },
    { value: 'price_desc', label: 'Сначала дороже' },
  ];
  const categoryOptions = $derived([
    { value: '', label: 'Все категории' },
    ...metadata.categories.map((c) => ({ value: c.id, label: c.name })),
  ]);
  const brandOptions = $derived([
    { value: '', label: 'Все бренды' },
    ...metadata.brands.map((b) => ({ value: b.id, label: b.name })),
  ]);
  const filtered = $derived(Boolean(query || status || category || brand));

  async function load() {
    loading = true;
    error = '';
    try {
      const [list, refs] = await Promise.all([
        api.GET('/api/v1/admin/products', {
          params: {
            query: {
              locale: 'ru',
              q: query,
              page,
              limit: pageSize,
              sort,
              ...(status ? { status } : {}),
              ...(category ? { category } : {}),
              ...(brand ? { brand } : {}),
            },
          },
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

  /** Любой новый фильтр начинает с первой страницы. */
  function refilter(change: () => void) {
    change();
    page = 1;
    void load();
  }
  function edit(product: Product | null) {
    if (!canWrite) return;
    editing = product;
    editKey++;
    notice = '';
  }
  async function saved() {
    editing = undefined;
    notice = 'Товар сохранён.';
    await load();
  }
  const categoryName = (product: Product) =>
    metadata.categories.find((c) => c.id === product.categoryIds[0])?.name ??
    '';
  const brandName = (product: Product) =>
    metadata.brands.find((b) => b.id === product.brandId)?.name ?? '';
  function price(product: Product) {
    const values = product.variants.map((v) => v.priceMinor / 100);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max
      ? `${money.format(min)} L`
      : `${money.format(min)}–${money.format(max)} L`;
  }
  function meta(product: Product) {
    const count = product.variants.length;
    if (count === 1) return product.variants[0]?.sku ?? '';
    return `${count} ${count < 5 ? 'варианта' : 'вариантов'}`;
  }
  /** Сколько лежит: число, оттенок и разбивка по складам («Кишинёв 20, Бельцы 8»). */
  function stock(product: Product) {
    const left = product.stock?.onHand;
    if (left === undefined) return null;
    const where = (product.stock?.warehouses ?? [])
      .filter((w) => w.onHand > 0)
      .map((w) => `${w.name.split(',')[0]} ${w.onHand}`)
      .join(', ');
    return {
      text: `${left} шт`,
      level: left === 0 ? 'out' : left <= low ? 'low' : 'plenty',
      where: where || 'Ни на одном складе',
    };
  }
</script>

<header class="head">
  <h1>Товары</h1>
  <form
    class="search"
    role="search"
    onsubmit={(event) => {
      event.preventDefault();
      refilter(() => {});
    }}
  >
    <Icon name="search" size={18} />
    <input
      bind:value={query}
      type="search"
      maxlength="200"
      placeholder="Название или артикул"
      aria-label="Поиск товаров"
    />
  </form>
  {#if canWrite}<button
      class="btn primary new"
      type="button"
      aria-label="Новый товар"
      onclick={() => edit(null)}
      disabled={loading}
      ><Icon name="plus" size={18} /><span class="label">Новый товар</span
      ></button
    >{/if}
  {@render tools?.()}
</header>

{#if error}<p role="alert" class="message error">{error}</p>{/if}
{#if notice}<p role="status" class="message">{notice}</p>{/if}

<section class="list" aria-busy={loading} aria-label="Список товаров">
  <div class="bar">
    <div class="tabs" role="group" aria-label="Статус">
      {#each tabs as [value, label] (value)}
        <button
          type="button"
          aria-pressed={status === value}
          onclick={() => refilter(() => (status = value))}>{label}</button
        >
      {/each}
    </div>
    <div class="filters">
      <ChipSelect
        label="Категория"
        value={category}
        options={categoryOptions}
        onChange={(value) => refilter(() => (category = value))}
      />
      <ChipSelect
        label="Бренд"
        value={brand}
        options={brandOptions}
        onChange={(value) => refilter(() => (brand = value))}
      />
      <ChipSelect
        label="Порядок"
        icon="sort"
        value={sort}
        options={sorts}
        onChange={(value) => refilter(() => (sort = value))}
      />
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <caption class="visually-hidden">Товары</caption>
      <thead>
        <tr>
          <th>Товар</th>
          <th>Категория</th>
          <th class="num">Цена</th>
          <th class="stock-col">Остаток</th>
          <th>Статус</th>
          <th><span class="visually-hidden">Открыть</span></th>
        </tr>
      </thead>
      <tbody>
        {#each products as product (product.id)}
          {@const left = stock(product)}
          <tr class:clickable={canWrite} onclick={() => edit(product)}>
            <td>
              <div class="product">
                <span class="thumb">
                  {#if product.images[0]}<img
                      src={product.images[0].url}
                      alt=""
                      width="60"
                      height="60"
                    />{:else}<Icon name="image" size={20} />{/if}
                </span>
                <span class="name">
                  <strong>{product.translations.ru.name}</strong>
                  <span class="tags">
                    <span>{meta(product)}</span>
                    {#if brandName(product)}<span>{brandName(product)}</span
                      >{/if}
                  </span>
                </span>
              </div>
            </td>
            <td class="muted-cell">{categoryName(product)}</td>
            <td class="num price">{price(product)}</td>
            <td class="stock-col">
              {#if left}
                <span class="left {left.level}"
                  >{left.text}{#if left.level === 'low'}<small>мало</small
                    >{:else if left.level === 'out'}<small>нет</small
                    >{/if}</span
                >
                <span class="where">{left.where}</span>
              {:else}<span class="where">нет данных</span>{/if}
            </td>
            <td
              ><span class="pill {product.status}"
                >{statusLabel[product.status]}</span
              ></td
            >
            <td class="go-cell">
              {#if canWrite}<button
                  class="go"
                  type="button"
                  aria-label="Открыть товар {product.translations.ru.name}"
                  onclick={(event) => {
                    event.stopPropagation();
                    edit(product);
                  }}><Icon name="arrow" size={18} /></button
                >{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- На телефоне вместо таблицы — карточки -->
  <ul class="cards">
    {#each products as product (product.id)}
      {@const left = stock(product)}
      <li>
        <button
          type="button"
          disabled={!canWrite}
          onclick={() => edit(product)}
        >
          <span class="thumb">
            {#if product.images[0]}<img
                src={product.images[0].url}
                alt=""
                width="60"
                height="60"
              />{:else}<Icon name="image" size={20} />{/if}
          </span>
          <span class="name">
            <strong>{product.translations.ru.name}</strong>
            <span class="line">
              <b class="price">{price(product)}</b>
              {#if left}<span class="left {left.level}"
                  >{left.text}{#if left.level === 'low'}<small>мало</small
                    >{:else if left.level === 'out'}<small>нет</small
                    >{/if}</span
                >{/if}
            </span>
          </span>
          <Icon name="arrow" size={18} />
        </button>
      </li>
    {/each}
  </ul>

  {#if !products.length && !loading}
    <div class="empty">
      <p>
        {filtered
          ? 'По этим условиям товаров нет.'
          : 'Товаров пока нет. Добавьте первый.'}
      </p>
      {#if filtered}<button
          class="btn small"
          type="button"
          onclick={() =>
            refilter(() => {
              query = '';
              status = '';
              category = '';
              brand = '';
            })}>Сбросить условия</button
        >{/if}
    </div>
  {/if}

  <footer>
    <Pager
      {page}
      {pages}
      onPage={(next) => {
        page = next;
        void load();
      }}
    />
  </footer>
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
  /* Заголовок, поиск во всю свободную ширину, новый товар и уведомления — одной строкой. */
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.25rem;
    margin-bottom: 1.1rem;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 3vw, 2.125rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.05;
  }
  .search {
    display: flex;
    flex: 1 1 18rem;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.875rem;
    padding: 0 1rem;
    border: 1px solid #e2dbc8;
    border-radius: var(--radius-pill);
    background: var(--color-paper);
    color: var(--color-muted);
    transition:
      border-color var(--motion-normal) var(--ease-standard),
      box-shadow var(--motion-normal) var(--ease-standard);
  }
  .search:focus-within {
    border-color: var(--color-ink);
    box-shadow: 0 0 0 4px rgb(245 183 0 / 24%);
  }
  .search input {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--color-ink);
    outline: none;
  }
  .new {
    min-height: 2.875rem;
    padding: 0 1.3rem;
  }

  .list {
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--color-paper);
    box-shadow:
      0 1px 0 rgb(23 21 15 / 4%),
      0 0.9rem 2.5rem rgb(23 21 15 / 6%);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.25rem 0;
  }
  /* Вкладки статуса: выбранную подчёркивает медовая черта. */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 1.4rem;
  }
  .tabs button {
    padding: 0.4rem 0 0.75rem;
    border: 0;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--color-muted);
    font-weight: 600;
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--ease-standard),
      border-color var(--motion-normal) var(--ease-standard);
  }
  .tabs button:hover {
    color: var(--color-ink);
  }
  .tabs button[aria-pressed='true'] {
    border-bottom-color: var(--color-honey);
    color: var(--color-ink);
    font-weight: 700;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-bottom: 0.6rem;
  }

  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 56rem;
    border-collapse: collapse;
  }
  th {
    padding: 0.7rem 0.75rem;
    border-top: 1px solid var(--color-line);
    border-bottom: 1px solid var(--color-line);
    background: #faf8f1;
    color: var(--color-muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-align: left;
    text-transform: uppercase;
  }
  th:first-child,
  td:first-child {
    padding-left: 1.25rem;
  }
  th:last-child,
  td:last-child {
    padding-right: 1.25rem;
  }
  td {
    padding: 0.875rem 0.75rem;
    border-bottom: 1px solid #f3eee2;
    vertical-align: middle;
  }
  tr {
    animation: row-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
    transition: background-color 0.2s;
  }
  @keyframes row-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  tr.clickable {
    cursor: pointer;
  }
  tbody tr:hover {
    background: #fbf9f3;
  }
  .num {
    text-align: right;
  }
  .product {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .thumb {
    display: grid;
    flex: none;
    place-items: center;
    width: 3.75rem;
    height: 3.75rem;
    overflow: hidden;
    border-radius: 1rem;
    background: var(--color-sand);
    box-shadow: inset 0 0 0 1px rgb(23 21 15 / 6%);
    color: var(--color-muted);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.25s;
  }
  tr:hover .thumb img {
    transform: scale(1.04);
  }
  .name {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }
  .name strong {
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.25;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .tags span {
    padding: 0.125rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--color-sand);
    color: #4b4535;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  .muted-cell {
    color: #3d3829;
  }
  .price {
    font-family: var(--font-display);
    font-size: 0.9375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .stock-col {
    padding-left: 1.75rem;
  }
  .left {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .left small {
    padding: 0.0625rem 0.5rem;
    border-radius: var(--radius-pill);
    font-size: 0.75rem;
  }
  .left.low {
    color: #8a5a00;
  }
  .left.low small {
    background: var(--color-honey-soft);
  }
  .left.out {
    color: #8f1c13;
  }
  .left.out small {
    background: #fbe9e7;
  }
  .where {
    display: block;
    color: var(--color-muted);
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.75rem 0.3rem 0.6rem;
    border-radius: var(--radius-pill);
    font-size: 0.8125rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .pill::before {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    content: '';
  }
  .pill.active {
    background: #fff8e1;
    color: #4b3a00;
  }
  .pill.active::before {
    background: var(--color-honey);
  }
  .pill.draft {
    background: var(--color-sand);
    color: #3d3829;
  }
  .pill.draft::before {
    background: #9a917a;
  }
  .pill.archived {
    background: #efeae0;
    color: var(--color-muted);
  }
  .pill.archived::before {
    background: var(--color-muted);
  }
  .go-cell {
    text-align: right;
  }
  .go {
    display: inline-grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--color-sand);
    color: var(--color-ink);
    cursor: pointer;
    transition:
      background-color 0.2s,
      color 0.2s;
  }
  tr:hover .go {
    background: var(--color-ink);
    color: #ffffff;
  }

  .cards {
    display: none;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 2.5rem 1rem;
    color: var(--color-muted);
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
  footer {
    display: flex;
    justify-content: center;
    padding: 1.1rem 1.25rem 1.35rem;
  }
  footer:empty {
    display: none;
  }

  /* Телефон: таблица превращается в карточки. */
  @media (max-width: 47.99rem) {
    .head {
      gap: 0.75rem;
    }
    /* Новый товар — круглая кнопка с плюсом рядом с заголовком. */
    .head h1 {
      flex: 1;
    }
    .head .new {
      width: 3rem;
      min-height: 3rem;
      padding: 0;
      justify-content: center;
    }
    .new .label {
      display: none;
    }
    .search {
      order: 3;
      flex-basis: 100%;
    }
    .list {
      overflow: visible;
      background: transparent;
      box-shadow: none;
    }
    .bar {
      padding: 0 0 0.75rem;
    }
    .tabs {
      gap: 1rem;
      overflow-x: auto;
      flex-wrap: nowrap;
    }
    .table-wrap {
      display: none;
    }
    .cards {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cards button {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.6rem 0.75rem 0.6rem 0.6rem;
      border: 0;
      border-radius: 1.1rem;
      background: var(--color-paper);
      color: var(--color-ink);
      text-align: left;
    }
    .cards button:disabled {
      cursor: default;
      opacity: 1;
    }
    .cards .name {
      flex: 1;
    }
    .cards .name strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.875rem;
    }
    .line .left.plenty {
      color: var(--color-muted);
      font-weight: 600;
    }
    footer {
      padding: 1rem 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    tr {
      animation: none;
    }
  }
</style>
