<script lang="ts">
  import { untrack } from 'svelte';
  import {
    api,
    draftOf,
    emptyDraft,
    errorText,
    type Product,
    type Metadata,
  } from '../lib/catalog';
  let {
    product,
    metadata,
    onSaved,
    onCancel,
    onExpired,
  }: {
    product: Product | null;
    metadata: Metadata;
    onSaved: () => void;
    onCancel: () => void;
    onExpired: () => void;
  } = $props();
  // Parent keys the editor per selection: edits intentionally keep their own snapshot.
  let draft = $state(
    untrack(() => (product ? draftOf(product) : emptyDraft())),
  );
  let images = $state(untrack(() => product?.images ?? []));
  let busy = $state(false);
  let error = $state('');
  let attributeCode = $state('');
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      if (
        product?.status !== 'archived' &&
        draft.status === 'archived' &&
        !confirm('Архивировать товар? Он исчезнет из публичного каталога.')
      )
        return;
      const result = product
        ? await api.PUT('/api/v1/admin/products/{id}', {
            params: { path: { id: product.id } },
            body: { ...draft, revision: product.revision },
            signal: AbortSignal.timeout(15000),
          })
        : await api.POST('/api/v1/admin/products', {
            body: draft,
            signal: AbortSignal.timeout(15000),
          });
      if (result.error) {
        error = errorText(result.error.error.code);
        if (result.response.status === 401) onExpired();
        return;
      }
      onSaved();
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }
  async function upload(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      error = errorText('IMAGE_TOO_LARGE');
      return;
    }
    busy = true;
    error = '';
    try {
      const result = await api.POST('/api/v1/admin/media', {
        body: file as unknown as string,
        bodySerializer: () => file,
        headers: { 'Content-Type': 'application/octet-stream' },
        signal: AbortSignal.timeout(60000),
      });
      if (result.data) {
        images = [...images, result.data];
        draft.mediaIds = [...draft.mediaIds, result.data.id];
      } else {
        error = errorText(result.error?.error.code);
        if (result.response.status === 401) onExpired();
      }
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={save} class="editor" aria-label="Редактор товара">
  <div class="toolbar">
    <h2>{product ? 'Редактирование товара' : 'Новый товар'}</h2>
    <button type="button" onclick={onCancel} disabled={busy}>Закрыть</button>
  </div>
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  <fieldset disabled={busy}>
    <legend>Основные данные</legend>
    <div class="fields">
      <label
        >Адрес товара<input
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxlength="160"
          bind:value={draft.slug}
          placeholder="uley-dadan-10"
        /></label
      >
      <label
        >Статус<select bind:value={draft.status}
          ><option value="draft">Черновик</option><option value="active"
            >Опубликован</option
          ><option value="archived">Архив</option></select
        ></label
      >
      <label
        >Бренд<select bind:value={draft.brandId}
          ><option value={null}>Без бренда</option
          >{#each metadata.brands as brand}<option value={brand.id}
              >{brand.name}</option
            >{/each}</select
        ></label
      >
    </div>
    <fieldset>
      <legend>Категории — выберите хотя бы одну</legend
      >{#each metadata.categories as category}<label class="check"
          ><input
            type="checkbox"
            value={category.id}
            bind:group={draft.categoryIds}
          />{category.name}</label
        >{/each}{#if !metadata.categories.length}<p>
          Сначала создайте категорию в справочниках.
        </p>{/if}
    </fieldset>
    {#each ['ru', 'ro'] as locale}<fieldset>
        <legend>{locale === 'ru' ? 'Русский' : 'Română'}</legend><label
          >Название ({locale})<input
            required
            maxlength="200"
            bind:value={draft.translations[locale as 'ru' | 'ro'].name}
          /></label
        ><label
          >Описание ({locale})<textarea
            rows="5"
            maxlength="20000"
            bind:value={draft.translations[locale as 'ru' | 'ro'].description}
          ></textarea></label
        >
        <div class="fields">
          <label
            >SEO title ({locale})<input
              maxlength="200"
              bind:value={draft.translations[locale as 'ru' | 'ro'].seoTitle}
            /></label
          ><label
            >SEO description ({locale})<textarea
              maxlength="500"
              bind:value={
                draft.translations[locale as 'ru' | 'ro'].seoDescription
              }></textarea></label
          >
        </div>
      </fieldset>{/each}
    <fieldset>
      <legend>Варианты</legend>{#each draft.variants as variant, index}<section
          class="variant"
        >
          <div class="fields">
            <label
              >Артикул<input
                required
                maxlength="64"
                bind:value={variant.sku}
              /></label
            ><label
              >Название варианта<input
                required
                maxlength="160"
                bind:value={variant.name}
              /></label
            ><label
              >Цена, MDL<input
                required
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={variant.priceMinor / 100}
                oninput={(e) =>
                  (variant.priceMinor = Math.round(
                    Number(e.currentTarget.value) * 100,
                  ))}
              /></label
            >
          </div>
          <label class="check"
            ><input type="checkbox" bind:checked={variant.active} />Вариант
            активен</label
          >
          {#each Object.keys(variant.attributes) as code}<div class="attribute">
              <label
                >{metadata.attributes.find((a) => a.code === code)?.name ??
                  code}<input
                  required
                  maxlength="300"
                  bind:value={variant.attributes[code]}
                /></label
              ><button
                type="button"
                onclick={() => {
                  const { [code]: _, ...rest } = variant.attributes;
                  variant.attributes = rest;
                }}>Убрать</button
              >
            </div>{/each}
          <div class="toolbar">
            <label
              >Добавить характеристику<select bind:value={attributeCode}
                ><option value="">Выберите</option
                >{#each metadata.attributes as attribute}<option
                    value={attribute.code}>{attribute.name}</option
                  >{/each}</select
              ></label
            ><button
              type="button"
              disabled={!attributeCode}
              onclick={() => {
                if (attributeCode)
                  variant.attributes = {
                    ...variant.attributes,
                    [attributeCode]: variant.attributes[attributeCode] ?? '',
                  };
              }}>Добавить</button
            >{#if draft.variants.length > 1}<button
                type="button"
                onclick={() =>
                  (draft.variants = draft.variants.filter(
                    (_, i) => i !== index,
                  ))}>Убрать вариант</button
              >{/if}
          </div>
        </section>{/each}<button
        type="button"
        disabled={draft.variants.length >= 50}
        onclick={() =>
          (draft.variants = [
            ...draft.variants,
            { sku: '', name: '', priceMinor: 0, active: true, attributes: {} },
          ])}>Добавить вариант</button
      >
    </fieldset>
    <fieldset>
      <legend>Изображения</legend>
      <p>JPEG, PNG или WebP до 8 МБ. Первое изображение — главное.</p>
      <div class="images">
        {#each images as image}<div>
            <img
              src={image.url}
              alt="Изображение товара"
              width="120"
              height="120"
            /><button
              type="button"
              onclick={() => {
                images = images.filter((i) => i.id !== image.id);
                draft.mediaIds = draft.mediaIds.filter((id) => id !== image.id);
              }}>Убрать фото</button
            >
          </div>{/each}
      </div>
      <label
        >Загрузить фото<input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={images.length >= 10}
          onchange={upload}
        /></label
      >
    </fieldset>
  </fieldset>
  <button
    class="button"
    type="submit"
    disabled={busy || !draft.categoryIds.length}
    >{busy ? 'Сохраняем…' : 'Сохранить товар'}</button
  >
</form>

<style>
  .editor {
    margin-block: var(--space-lg);
    padding: var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
  }
  fieldset {
    border: 1px solid var(--color-line);
    margin-block: var(--space-md);
    padding: var(--space-md);
    min-width: 0;
  }
  fieldset:disabled {
    opacity: 0.7;
  }
  .fields {
    display: grid;
    gap: var(--space-md);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    align-items: center;
    justify-content: space-between;
  }
  .variant {
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-line);
  }
  .attribute {
    display: flex;
    gap: var(--space-md);
    align-items: end;
  }
  .images {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  .images > div {
    display: grid;
  }
  .images img {
    object-fit: contain;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .check input {
    width: auto;
  }
  .error {
    color: var(--color-danger);
  }
  @media (min-width: 48rem) {
    .fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
