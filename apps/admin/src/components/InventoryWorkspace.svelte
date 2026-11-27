<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { api, errorText, type Product } from '../lib/catalog';
  import Icon from './Icon.svelte';

  type Warehouse = { id: string; code: string; name: string; active: boolean };
  let {
    permissions,
    onExpired,
    tools,
  }: { permissions: string[]; onExpired: () => void; tools?: Snippet } =
    $props();
  let warehouses = $state<Warehouse[]>([]);
  let products = $state<Product[]>([]);
  let selectedWarehouse = $state('');
  let selectedVariant = $state('');
  let delta = $state(1);
  let reason = $state('');
  let warehouseCode = $state('');
  let warehouseName = $state('');
  let loading = $state(false);
  let error = $state('');
  let notice = $state('');
  let lastAdjustment = $state<{ onHand: number; reserved: number } | null>(
    null,
  );
  let pendingKey = '';
  let pendingPayload = '';
  const canAdjust = $derived(permissions.includes('inventory.adjust'));
  const canManage = $derived(permissions.includes('warehouses.manage'));

  async function load() {
    loading = true;
    error = '';
    try {
      const [warehouseResult, catalogResult] = await Promise.all([
        api.GET('/api/v1/admin/warehouses', {
          signal: AbortSignal.timeout(10000),
        }),
        api.GET('/api/v1/products', {
          params: { query: { locale: 'ru', limit: 48 } },
          signal: AbortSignal.timeout(10000),
        }),
      ]);
      if (
        warehouseResult.response.status === 401 ||
        catalogResult.response.status === 401
      ) {
        onExpired();
        return;
      }
      if (warehouseResult.error || catalogResult.error) {
        error = errorText(
          warehouseResult.error?.error.code ?? catalogResult.error?.error.code,
        );
        return;
      }
      warehouses = warehouseResult.data.filter((warehouse) => warehouse.active);
      products = catalogResult.data.items;
      selectedWarehouse ||= warehouses[0]?.id ?? '';
      selectedVariant ||=
        products[0]?.variants.find((variant) => variant.active)?.id ?? '';
    } catch {
      error = errorText();
    } finally {
      loading = false;
    }
  }

  onMount(() => void load());

  async function createWarehouse(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    error = '';
    notice = '';
    try {
      const result = await api.POST('/api/v1/admin/warehouses', {
        body: { code: warehouseCode.trim(), name: warehouseName.trim() },
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
      warehouseCode = '';
      warehouseName = '';
      notice = 'Склад создан.';
      await load();
    } catch {
      error = errorText();
    } finally {
      loading = false;
    }
  }

  async function adjustInventory(event: SubmitEvent) {
    event.preventDefault();
    if (
      !selectedWarehouse ||
      !selectedVariant ||
      !Number.isInteger(delta) ||
      delta === 0
    )
      return;
    const body = {
      warehouseId: selectedWarehouse,
      variantId: selectedVariant,
      delta,
      reason: reason.trim(),
    };
    const payload = JSON.stringify(body);
    if (pendingPayload !== payload || !pendingKey) {
      pendingPayload = payload;
      pendingKey = crypto.randomUUID();
    }
    loading = true;
    error = '';
    notice = '';
    try {
      const result = await api.POST('/api/v1/admin/inventory/adjustments', {
        body,
        params: { header: { 'Idempotency-Key': pendingKey } },
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
      lastAdjustment = result.data;
      notice = result.data.replayed
        ? 'Повтор запроса распознан: корректировка не применялась повторно.'
        : 'Остаток обновлён.';
      pendingKey = '';
      pendingPayload = '';
      reason = '';
      await load();
    } catch {
      // Retain the key and payload so a retry after a timeout is idempotent.
      error = errorText();
    } finally {
      loading = false;
    }
  }
</script>

<header class="page-head">
  <div>
    <h1 id="inventory-heading">Склады и остатки</h1>
    <p>Складов: {warehouses.length}</p>
  </div>
  {@render tools?.()}
</header>

{#if error}<p role="alert" class="message error">{error}</p>{/if}
{#if notice}<p role="status" class="message">{notice}</p>{/if}

<div class="layout" aria-busy={loading}>
  {#if canAdjust}
    <form class="panel" onsubmit={adjustInventory}>
      <h2 class="panel-title">Корректировка остатка</h2>
      {#if warehouses.length === 0}
        <p class="muted">Сначала создайте склад.</p>
      {:else}
        <div class="form-grid two">
          <label class="field"
            >Склад
            <select bind:value={selectedWarehouse} required>
              {#each warehouses as warehouse}<option value={warehouse.id}
                  >{warehouse.name} ({warehouse.code})</option
                >{/each}
            </select>
          </label>
          <label class="field"
            >Изменение количества<input
              type="number"
              bind:value={delta}
              required
              min="-1000000"
              max="1000000"
              step="1"
            /><span class="hint">Плюс — приход на склад, минус — списание.</span
            ></label
          >
          <label class="field wide"
            >Вариант товара
            <select bind:value={selectedVariant} required>
              {#each products as product}
                <optgroup label={product.translations.ru.name}>
                  {#each product.variants.filter((variant) => variant.active) as variant}
                    <option value={variant.id}
                      >{product.translations.ru.name}, {variant.name}, {variant.sku}</option
                    >
                  {/each}
                </optgroup>
              {/each}
            </select>
          </label>
          <label class="field wide"
            >Причина<input
              bind:value={reason}
              required
              maxlength="240"
              placeholder="Приёмка от поставщика, пересчёт, брак"
            /></label
          >
        </div>
        <div class="submit">
          {#if lastAdjustment}
            <p class="result">
              После изменения: на складе {lastAdjustment.onHand},
              зарезервировано {lastAdjustment.reserved}.
            </p>
          {/if}
          <button
            class="btn primary"
            disabled={loading || !selectedVariant || !reason.trim()}
            >Применить изменение</button
          >
        </div>
      {/if}
    </form>
  {/if}

  <section class="panel warehouses">
    <h2 class="panel-title">Склады</h2>
    <ul aria-label="Список складов">
      {#each warehouses as warehouse (warehouse.id)}<li>
          <span class="mark" aria-hidden="true"
            ><Icon name="inventory" size={18} /></span
          >
          <span class="cell-main"
            ><strong>{warehouse.name}</strong><small class="muted"
              >{warehouse.code}</small
            ></span
          >
        </li>{/each}
    </ul>
    {#if !warehouses.length && !loading}<p class="muted">
        Складов пока нет.
      </p>{/if}
    {#if canManage}
      <form class="new" onsubmit={createWarehouse}>
        <h3>Новый склад</h3>
        <label class="field"
          >Код<input
            bind:value={warehouseCode}
            required
            maxlength="64"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="chisinau"
          /></label
        >
        <label class="field"
          >Название<input
            bind:value={warehouseName}
            required
            maxlength="120"
            placeholder="Кишинёв, основной склад"
          /></label
        >
        <button class="btn" disabled={loading}
          ><Icon name="plus" size={16} />Создать склад</button
        >
      </form>
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    align-items: start;
    gap: var(--space-md);
  }
  .layout > .panel + .panel {
    margin-top: 0;
  }
  @media (min-width: 64rem) {
    .layout {
      grid-template-columns: minmax(0, 1.6fr) minmax(18rem, 1fr);
    }
  }
  .field.wide {
    grid-column: 1 / -1;
  }
  .field .hint {
    font-size: 0.8125rem;
  }
  .submit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm) var(--space-md);
    margin-top: var(--space-md);
  }
  .result {
    flex: 1;
    margin: 0;
    color: var(--color-muted);
    font-size: 0.875rem;
  }
  ul {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    background: #fbf8ef;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.65rem;
    background: var(--color-honey-soft);
  }
  .new {
    display: grid;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-line);
  }
  .new h3 {
    margin: 0;
    font-size: 0.9375rem;
  }
  .new :global(.btn) {
    justify-self: start;
  }
</style>
