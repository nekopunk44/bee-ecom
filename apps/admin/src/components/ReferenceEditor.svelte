<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorText, type Metadata } from '../lib/catalog';
  import Icon from './Icon.svelte';
  let { onExpired }: { onExpired: () => void } = $props();
  type Kind = 'categories' | 'brands' | 'attributes';
  let metadata = $state<Metadata>({
    categories: [],
    brands: [],
    attributes: [],
  });
  // Форма открыта у одного справочника за раз.
  let adding = $state<Kind | null>(null);
  let code = $state('');
  let nameRu = $state('');
  let nameRo = $state('');
  let unit = $state('');
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  const titles: Record<Kind, string> = {
    categories: 'Категории',
    brands: 'Бренды',
    attributes: 'Атрибуты',
  };

  async function load() {
    try {
      const result = await api.GET('/api/v1/catalog/metadata', {
        params: { query: { locale: 'ru' } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.data) metadata = result.data;
      else error = errorText(result.error?.error.code);
    } catch {
      error = errorText();
    }
  }
  onMount(() => void load());

  function start(kind: Kind) {
    adding = adding === kind ? null : kind;
    code = '';
    nameRu = '';
    nameRo = '';
    unit = '';
    error = '';
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!adding) return;
    busy = true;
    error = '';
    notice = '';
    try {
      const result = await api.POST(`/api/v1/admin/${adding}`, {
        body: { slug: code, code, name: nameRu, nameRu, nameRo, unit },
        signal: AbortSignal.timeout(10000),
      });
      if (result.response.status === 401) onExpired();
      if (result.error) {
        error = errorText(result.error.error.code);
        return;
      }
      notice = `${titles[adding]}: «${nameRu}» добавлено.`;
      adding = null;
      await load();
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }
  const rows = $derived({
    categories: metadata.categories.map((item) => [item.name, item.slug]),
    brands: metadata.brands.map((item) => [item.name, item.slug]),
    attributes: metadata.attributes.map((item) => [
      item.name,
      [item.code, item.unit].filter(Boolean).join(', '),
    ]),
  } as Record<Kind, string[][]>);
</script>

<header class="page-head">
  <div>
    <h1>Справочники</h1>
    <p>Категории, бренды и характеристики для карточек товаров</p>
  </div>
</header>

{#if error}<p role="alert" class="message error">{error}</p>{/if}
{#if notice}<p role="status" class="message">{notice}</p>{/if}

<div class="references">
  {#each ['categories', 'brands', 'attributes'] as const as kind (kind)}
    <section class="panel" aria-labelledby={`${kind}-heading`}>
      <div class="head">
        <h2 class="panel-title" id={`${kind}-heading`}>
          {titles[kind]} <span class="muted">{rows[kind].length}</span>
        </h2>
        <button
          class="btn small"
          type="button"
          aria-expanded={adding === kind}
          onclick={() => start(kind)}
          ><Icon
            name={adding === kind ? 'close' : 'plus'}
            size={16}
          />{adding === kind ? 'Отмена' : 'Добавить'}</button
        >
      </div>
      {#if adding === kind}
        <form class="add" onsubmit={save}>
          <fieldset disabled={busy}>
            <label class="field"
              >Код латиницей<input
                required
                bind:value={code}
                maxlength="120"
                pattern={kind === 'attributes'
                  ? '[a-z][a-z0-9_]{0,39}'
                  : '[a-z0-9]+(-[a-z0-9]+)*'}
              /></label
            ><label class="field"
              >{kind === 'brands' ? 'Название' : 'Название RU'}<input
                required
                bind:value={nameRu}
                maxlength="120"
              /></label
            >{#if kind !== 'brands'}<label class="field"
                >Название RO<input
                  required
                  bind:value={nameRo}
                  maxlength="120"
                /></label
              >{/if}{#if kind === 'attributes'}<label class="field"
                >Единица измерения<input
                  bind:value={unit}
                  maxlength="20"
                /></label
              >{/if}<button class="btn primary" type="submit"
              >{busy ? 'Сохраняем…' : 'Сохранить'}</button
            >
          </fieldset>
        </form>
      {/if}
      <ul>
        {#each rows[kind] as [name, detail]}<li>
            <span>{name}</span><small class="muted">{detail}</small>
          </li>{/each}
      </ul>
      {#if !rows[kind].length}<p class="muted">Пока пусто.</p>{/if}
    </section>
  {/each}
</div>

<style>
  .references {
    display: grid;
    align-items: start;
    gap: var(--space-md);
  }
  .references > .panel + .panel {
    margin-top: 0;
  }
  @media (min-width: 64rem) {
    .references {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }
  .head .panel-title {
    margin: 0;
  }
  .head .muted {
    margin-left: 0.3rem;
    font-weight: 500;
  }
  .add fieldset {
    display: grid;
    gap: var(--space-sm);
    margin: 0 0 var(--space-md);
    padding: var(--space-md);
    border: 0;
    border-radius: var(--radius-sm);
    background: #fbf8ef;
  }
  .add :global(.btn) {
    justify-self: start;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--color-line);
    font-size: 0.9375rem;
  }
  li:last-child {
    border-bottom: 0;
  }
  li small {
    text-align: right;
  }
</style>
