<script lang="ts">
  import { api, errorText, type Metadata } from '../lib/catalog';
  let { metadata, onSaved }: { metadata: Metadata; onSaved: () => void } =
    $props();
  let kind = $state<'categories' | 'brands' | 'attributes'>('categories');
  let code = $state('');
  let nameRu = $state('');
  let nameRo = $state('');
  let unit = $state('');
  let busy = $state(false);
  let error = $state('');
  async function save(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const result = await api.POST(`/api/v1/admin/${kind}`, {
        body: { slug: code, code, name: nameRu, nameRu, nameRo, unit },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) error = errorText(result.error.error.code);
      else {
        code = '';
        nameRu = '';
        nameRo = '';
        unit = '';
        onSaved();
      }
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }
</script>

<section>
  <h2>Справочники каталога</h2>
  <div class="references">
    <div>
      <h3>Категории</h3>
      <ul>
        {#each metadata.categories as item}<li>
            {item.name} <small>{item.slug}</small>
          </li>{/each}
      </ul>
    </div>
    <div>
      <h3>Бренды</h3>
      <ul>
        {#each metadata.brands as item}<li>{item.name}</li>{/each}
      </ul>
    </div>
    <div>
      <h3>Атрибуты</h3>
      <ul>
        {#each metadata.attributes as item}<li>
            {item.name} <small>{item.code} {item.unit}</small>
          </li>{/each}
      </ul>
    </div>
  </div>
  <form onsubmit={save}>
    <h3>Добавить запись</h3>
    {#if error}<p role="alert">{error}</p>{/if}
    <fieldset disabled={busy}>
      <label
        >Справочник<select bind:value={kind}
          ><option value="categories">Категория</option><option value="brands"
            >Бренд</option
          ><option value="attributes">Атрибут</option></select
        ></label
      ><label
        >Код латиницей<input
          required
          bind:value={code}
          maxlength="120"
          pattern={kind === 'attributes'
            ? '[a-z][a-z0-9_]{0,39}'
            : '[a-z0-9]+(-[a-z0-9]+)*'}
        /></label
      ><label
        >{kind === 'brands' ? 'Название' : 'Название RU'}<input
          required
          bind:value={nameRu}
          maxlength="120"
        /></label
      >{#if kind !== 'brands'}<label
          >Название RO<input
            required
            bind:value={nameRo}
            maxlength="120"
          /></label
        >{/if}{#if kind === 'attributes'}<label
          >Единица измерения<input bind:value={unit} maxlength="20" /></label
        >{/if}<button class="button" type="submit"
        >{busy ? 'Сохраняем…' : 'Добавить'}</button
      >
    </fieldset>
  </form>
</section>

<style>
  .references {
    display: grid;
    gap: var(--space-lg);
  }
  fieldset {
    border: 0;
    max-width: 35rem;
    padding: 0;
  }
  small {
    color: var(--color-muted);
  }
  @media (min-width: 48rem) {
    .references {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
