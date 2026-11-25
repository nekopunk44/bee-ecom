<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  /** Панель справа поверх раздела: редактор товара, карточка заказа. Esc закрывает. */
  let {
    title,
    wide = false,
    onClose,
    children,
    footer,
  }: {
    title: string;
    wide?: boolean;
    onClose: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();
  let panel = $state<HTMLElement>();
  $effect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('keydown', key);
    document.body.classList.add('locked');
    return () => {
      removeEventListener('keydown', key);
      document.body.classList.remove('locked');
      opener?.focus();
    };
  });
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div
  class="drawer"
  class:wide
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
  bind:this={panel}
>
  <header>
    <h2>{title}</h2>
    <button
      class="btn icon quiet"
      type="button"
      aria-label="Закрыть"
      onclick={onClose}
    >
      <Icon name="close" />
    </button>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(23 21 15 / 35%);
    animation: fade var(--motion-normal) var(--ease-standard);
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(38rem, 100vw);
    background: var(--color-sand);
    box-shadow: -1rem 0 3rem rgb(23 21 15 / 18%);
    animation: slide var(--motion-normal) var(--ease-standard);
  }
  .drawer.wide {
    width: min(52rem, 100vw);
  }
  .drawer:focus {
    outline: none;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--color-paper);
    border-bottom: 1px solid var(--color-line);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.375rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-md) var(--space-lg) var(--space-lg);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-paper);
    border-top: 1px solid var(--color-line);
  }
  @keyframes slide {
    from {
      translate: 2rem 0;
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .drawer {
      animation: none;
    }
  }
</style>
