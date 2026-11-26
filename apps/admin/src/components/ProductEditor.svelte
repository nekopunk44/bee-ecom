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
  import Drawer from './Drawer.svelte';
  import Icon from './Icon.svelte';
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

<Drawer
  title={product ? product.translations.ru.name : 'Новый товар'}
  wide
  onClose={onCancel}
>
  <form id="product-form" onsubmit={save} aria-label="Редактор товара">
    {#if error}<p role="alert" class="message error">{error}</p>{/if}
    <fieldset disabled={busy}>
      <section class="panel">
        <h3 class="panel-title">Основное</h3>
        <div class="form-grid three">
          <label class="field"
            >Адрес товара<input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxlength="160"
              bind:value={draft.slug}
              placeholder="uley-dadan-10"
            /></label
          >
          <label class="field"
            >Статус<select bind:value={draft.status}
              ><option value="draft">Черновик</option><option value="active"
                >Опубликован</option
              ><option value="archived">Архив</option></select
            ></label
          >
          <label class="field"
            >Бренд<select bind:value={draft.brandId}
              ><option value={null}>Без бренда</option
              >{#each metadata.brands as brand}<option value={brand.id}
                  >{brand.name}</option
                >{/each}</select
            ></label
          >
        </div>
      </section>

      <section class="panel">
        <h3 class="panel-title">
          Категории <span class="muted">выберите хотя бы одну</span>
        </h3>
        <div class="chips">
          {#each metadata.categories as category}<label class="chip"
              ><input
                type="checkbox"
                value={category.id}
                bind:group={draft.categoryIds}
              /><span>{category.name}</span></label
            >{/each}
        </div>
        {#if !metadata.categories.length}<p class="muted">
            Сначала создайте категорию в справочниках.
          </p>{/if}
      </section>

      <section class="panel">
        <h3 class="panel-title">Названия и описания</h3>
        <div class="form-grid two">
          {#each ['ru', 'ro'] as const as locale}
            <div class="language">
              <p class="language-name">
                {locale === 'ru' ? 'Русский' : 'Română'}
              </p>
              <label class="field"
                >Название ({locale})<input
                  required
                  maxlength="200"
                  bind:value={draft.translations[locale].name}
                /></label
              ><label class="field"
                >Описание ({locale})<textarea
                  rows="5"
                  maxlength="20000"
                  bind:value={draft.translations[locale].description}
                ></textarea></label
              ><label class="field"
                >SEO title ({locale})<input
                  maxlength="200"
                  bind:value={draft.translations[locale].seoTitle}
                /></label
              ><label class="field"
                >SEO description ({locale})<textarea
                  rows="2"
                  maxlength="500"
                  bind:value={draft.translations[locale].seoDescription}
                ></textarea></label
              >
            </div>
          {/each}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3 class="panel-title">Варианты</h3>
          <button
            class="btn small"
            type="button"
            disabled={draft.variants.length >= 50}
            onclick={() =>
              (draft.variants = [
                ...draft.variants,
                {
                  sku: '',
                  name: '',
                  priceMinor: 0,
                  active: true,
                  attributes: {},
                },
              ])}><Icon name="plus" size={16} />Добавить вариант</button
          >
        </div>
        {#each draft.variants as variant, index}
          <div class="variant">
            <div class="form-grid three">
              <label class="field"
                >Артикул<input
                  required
                  maxlength="64"
                  bind:value={variant.sku}
                /></label
              ><label class="field"
                >Название варианта<input
                  required
                  maxlength="160"
                  bind:value={variant.name}
                /></label
              ><label class="field"
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
            {#each Object.keys(variant.attributes) as code}<div
                class="attribute"
              >
                <label class="field"
                  >{metadata.attributes.find((a) => a.code === code)?.name ??
                    code}<input
                    required
                    maxlength="300"
                    bind:value={variant.attributes[code]}
                  /></label
                ><button
                  class="btn small quiet"
                  type="button"
                  onclick={() => {
                    const { [code]: _, ...rest } = variant.attributes;
                    variant.attributes = rest;
                  }}>Убрать</button
                >
              </div>{/each}
            <div class="variant-foot">
              <label class="toggle"
                ><input type="checkbox" bind:checked={variant.active} /><span
                ></span>Вариант активен</label
              >
              {#if metadata.attributes.length}
                <label class="field inline"
                  ><span class="visually-hidden">Добавить характеристику</span
                  ><select bind:value={attributeCode}
                    ><option value="">Характеристика</option
                    >{#each metadata.attributes as attribute}<option
                        value={attribute.code}>{attribute.name}</option
                      >{/each}</select
                  ></label
                ><button
                  class="btn small"
                  type="button"
                  disabled={!attributeCode}
                  onclick={() => {
                    if (attributeCode)
                      variant.attributes = {
                        ...variant.attributes,
                        [attributeCode]:
                          variant.attributes[attributeCode] ?? '',
                      };
                  }}>Добавить</button
                >
              {/if}
              {#if draft.variants.length > 1}<button
                  class="btn small quiet remove"
                  type="button"
                  onclick={() =>
                    (draft.variants = draft.variants.filter(
                      (_, i) => i !== index,
                    ))}>Убрать вариант</button
                >{/if}
            </div>
          </div>
        {/each}
      </section>

      <section class="panel">
        <h3 class="panel-title">
          Фото <span class="muted"
            >JPEG, PNG или WebP до 8 МБ, первое — главное</span
          >
        </h3>
        <div class="images">
          {#each images as image, index (image.id)}<figure>
              <img
                src={image.url}
                alt={index === 0 ? 'Главное фото' : 'Фото товара'}
                width="120"
                height="120"
              />
              {#if index === 0}<span class="main">Главное</span>{/if}
              <button
                class="remove-image"
                type="button"
                aria-label="Убрать фото"
                onclick={() => {
                  images = images.filter((i) => i.id !== image.id);
                  draft.mediaIds = draft.mediaIds.filter(
                    (id) => id !== image.id,
                  );
                }}><Icon name="close" size={14} /></button
              >
            </figure>{/each}
          {#if images.length < 10}
            <label class="upload"
              ><Icon name="upload" /><span>Загрузить фото</span><input
                class="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onchange={upload}
              /></label
            >
          {/if}
        </div>
      </section>
    </fieldset>
  </form>
  {#snippet footer()}
    <button class="btn quiet" type="button" onclick={onCancel} disabled={busy}
      >Закрыть</button
    >
    <button
      class="btn primary"
      type="submit"
      form="product-form"
      disabled={busy || !draft.categoryIds.length}
      >{busy ? 'Сохраняем…' : 'Сохранить товар'}</button
    >
  {/snippet}
</Drawer>

<style>
  fieldset {
    display: grid;
    gap: var(--space-md);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  fieldset:disabled {
    opacity: 0.7;
  }
  .panel + .panel {
    margin-top: 0;
  }
  .panel-title .muted {
    margin-left: 0.4rem;
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .panel-head .panel-title {
    margin: 0;
  }
  .language {
    display: grid;
    align-content: start;
    gap: var(--space-sm);
  }
  .language-name {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }
  .variant {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-sm);
    background: #fbf8ef;
  }
  .variant + .variant {
    margin-top: var(--space-sm);
  }
  .attribute {
    display: flex;
    align-items: end;
    gap: var(--space-sm);
  }
  .attribute .field {
    flex: 1;
  }
  .variant-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .field.inline select {
    min-height: 2.125rem;
    padding-block: 0.3rem;
    font-size: 0.875rem;
  }
  .remove {
    margin-left: auto;
    color: var(--color-danger);
  }
  /* Переключатель «вариант активен»: капсула с бегунком. */
  .toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0 auto 0 0;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .toggle input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .toggle span {
    position: relative;
    flex: none;
    width: 2.5rem;
    height: 1.4rem;
    border-radius: var(--radius-pill);
    background: #dcd5c3;
    transition: background var(--motion-fast) var(--ease-standard);
  }
  .toggle span::after {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--color-paper);
    content: '';
    transition: translate var(--motion-fast) var(--ease-standard);
  }
  .toggle input:checked + span {
    background: var(--color-ink);
  }
  .toggle input:checked + span::after {
    background: var(--color-honey);
    translate: 1.1rem 0;
  }
  .toggle input:focus-visible + span {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  .images {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }
  figure {
    position: relative;
    margin: 0;
  }
  figure img {
    display: block;
    width: 7.5rem;
    height: 7.5rem;
    border-radius: var(--radius-sm);
    background: var(--color-sand);
    object-fit: cover;
  }
  .main {
    position: absolute;
    bottom: 0.4rem;
    left: 0.4rem;
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius-pill);
    background: var(--color-honey);
    font-size: 0.6875rem;
    font-weight: 700;
  }
  .remove-image {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgb(23 21 15 / 75%);
    color: #ffffff;
  }
  .upload {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.35rem;
    width: 7.5rem;
    height: 7.5rem;
    margin: 0;
    border: 2px dashed #dcd5c3;
    border-radius: var(--radius-sm);
    color: var(--color-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }
  .upload:hover,
  .upload:focus-within {
    border-color: var(--color-ink);
    color: var(--color-ink);
  }
</style>
