<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorText, type Product } from '../lib/catalog';

  type Warehouse = { id: string; code: string; name: string; active: boolean };
  let {
    permissions,
    onExpired,
  }: { permissions: string[]; onExpired: () => void } = $props();
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

<section aria-labelledby="inventory-heading">
  <h2 id="inventory-heading">Склады и остатки</h2>
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}

  {#if canManage}
    <form class="form" onsubmit={createWarehouse}>
      <h3>Новый склад</h3>
      <label
        >Код<input
          bind:value={warehouseCode}
          required
          maxlength="64"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        /></label
      >
      <label
        >Название<input
          bind:value={warehouseName}
          required
          maxlength="120"
        /></label
      >
      <button class="button" disabled={loading}>Создать склад</button>
    </form>
  {/if}

  {#if canAdjust}
    <form class="form" onsubmit={adjustInventory}>
      <h3>Корректировка остатка</h3>
      {#if warehouses.length === 0}
        <p>Сначала создайте склад.</p>
      {:else}
        <label
          >Склад
          <select bind:value={selectedWarehouse} required>
            {#each warehouses as warehouse}<option value={warehouse.id}
                >{warehouse.name} ({warehouse.code})</option
              >{/each}
          </select>
        </label>
        <label
          >Вариант товара
          <select bind:value={selectedVariant} required>
            {#each products as product}
              {#each product.variants.filter((variant) => variant.active) as variant}
                <option value={variant.id}
                  >{product.translations.ru.name}, {variant.name}, {variant.sku}</option
                >
              {/each}
            {/each}
          </select>
        </label>
        <label
          >Изменение количества<input
            type="number"
            bind:value={delta}
            required
            min="-1000000"
            max="1000000"
            step="1"
          /></label
        >
        <label
          >Причина<input bind:value={reason} required maxlength="240" /></label
        >
        <button
          class="button"
          disabled={loading || !selectedVariant || !reason.trim()}
          >Применить изменение</button
        >
      {/if}
    </form>
  {/if}

  {#if lastAdjustment}
    <p>
      После изменения: на складе {lastAdjustment.onHand}, зарезервировано {lastAdjustment.reserved}.
    </p>
  {/if}
  <ul aria-label="Список складов">
    {#each warehouses as warehouse}<li>
        {warehouse.name} <code>{warehouse.code}</code>
      </li>{/each}
  </ul>
  {#if loading}<p aria-live="polite">Загрузка…</p>{/if}
</section>

<style>
  section {
    margin-block: var(--space-lg);
  }
  .form {
    display: grid;
    gap: var(--space-md);
    max-width: 42rem;
    margin-block: var(--space-lg);
    padding: var(--space-lg);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  h3 {
    margin: 0;
  }
  label {
    display: grid;
    gap: var(--space-xs);
  }
  input,
  select {
    min-height: 2.75rem;
    padding: var(--space-sm);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-ink);
  }
  .error {
    color: var(--color-danger);
  }
</style>
