<script lang="ts" generics="T extends string">
  import Icon from './Icon.svelte';
  /**
   * Выбор одного значения кнопкой-капсулой со списком под ней, вместо стандартного
   * select: так фильтры выглядят одинаково во всех браузерах.
   */
  let {
    label,
    value,
    options,
    icon,
    onChange,
  }: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    icon?: 'sort';
    onChange: (value: T) => void;
  } = $props();
  let open = $state(false);
  let root = $state<HTMLElement>();
  const current = $derived(
    options.find((option) => option.value === value)?.label ?? label,
  );
  const id = `chip-${Math.random().toString(36).slice(2, 8)}`;

  function outside(event: MouseEvent) {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }
  function key(event: KeyboardEvent) {
    if (open && event.key === 'Escape') open = false;
  }
  function pick(next: T) {
    open = false;
    if (next !== value) onChange(next);
  }
</script>

<svelte:window onclick={outside} onkeydown={key} />

<div class="chip-select" bind:this={root}>
  <button
    type="button"
    class="chip"
    class:active={open}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={id}
    aria-label="{label}: {current}"
    onclick={() => (open = !open)}
  >
    {#if icon === 'sort'}<svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg
      >{/if}
    <span>{current}</span>
    <span class="chevron" class:turned={open}
      ><Icon name="arrow" size={15} /></span
    >
  </button>
  {#if open}
    <ul {id} role="listbox" aria-label={label}>
      {#each options as option (option.value)}
        <li
          role="option"
          aria-selected={option.value === value}
          tabindex="0"
          onclick={() => pick(option.value)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              pick(option.value);
            }
          }}
        >
          {option.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .chip-select {
    position: relative;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.375rem;
    padding: 0 0.75rem 0 0.9rem;
    border: 1px solid #e2dbc8;
    border-radius: var(--radius-pill);
    background: var(--color-paper);
    color: var(--color-ink);
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color var(--motion-fast) var(--ease-standard);
  }
  .chip:hover,
  .chip.active {
    border-color: var(--color-ink);
  }
  .chevron {
    display: inline-flex;
    rotate: 90deg;
    transition: rotate 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .chevron.turned {
    rotate: -90deg;
  }
  ul {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.4rem);
    right: 0;
    min-width: 13rem;
    max-height: 18rem;
    margin: 0;
    padding: 0.35rem;
    overflow: auto;
    border-radius: 1rem;
    background: var(--color-paper);
    box-shadow:
      0 1rem 2.5rem rgb(23 21 15 / 18%),
      0 0 0 1px rgb(23 21 15 / 5%);
    list-style: none;
    animation: drop 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes drop {
    from {
      opacity: 0;
      translate: 0 -0.3rem;
    }
  }
  li {
    padding: 0.55rem 0.75rem;
    border-radius: 0.7rem;
    font-size: 0.9375rem;
    cursor: pointer;
  }
  li:hover,
  li:focus-visible {
    background: var(--color-sand);
    outline: none;
  }
  li[aria-selected='true'] {
    background: var(--color-ink);
    color: #ffffff;
    font-weight: 700;
  }
</style>
