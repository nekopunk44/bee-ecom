<script lang="ts">
  /**
   * Переключение страниц тремя кнопками с номерами: тёмный кружок перескакивает на
   * выбранную. Если страниц больше трёх, окно из трёх номеров едет вместе с текущей.
   */
  let {
    page,
    pages,
    onPage,
  }: { page: number; pages: number; onPage: (page: number) => void } = $props();
  const first = $derived(Math.max(1, Math.min(page - 1, pages - 2)));
  const numbers = $derived(
    Array.from({ length: Math.min(3, pages) }, (_, index) => first + index),
  );
  const at = $derived(numbers.indexOf(page));
</script>

{#if pages > 1}
  <nav class="pager" aria-label="Страницы">
    <span class="dot at-{at}" aria-hidden="true"></span>
    {#each numbers as number (number)}
      <button
        type="button"
        aria-label="Страница {number}"
        aria-current={number === page ? 'page' : undefined}
        onclick={() => number !== page && onPage(number)}>{number}</button
      >
    {/each}
  </nav>
{/if}

<style>
  .pager {
    position: relative;
    display: flex;
    gap: 0.375rem;
    padding: 0.3rem;
    border-radius: var(--radius-pill);
    background: var(--color-sand);
  }
  .dot {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    width: 2.875rem;
    height: 2.875rem;
    border-radius: 50%;
    background: var(--color-ink);
    box-shadow: 0 0.5rem 1.1rem rgb(23 21 15 / 25%);
    transition: translate 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .at-1 {
    translate: 3.25rem 0;
  }
  .at-2 {
    translate: 6.5rem 0;
  }
  button {
    position: relative;
    width: 2.875rem;
    height: 2.875rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-ink);
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      color 0.35s,
      transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  button:hover {
    transform: translateY(-3px);
  }
  button:active {
    transform: scale(0.86);
  }
  button[aria-current] {
    color: #ffffff;
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      transition: none;
    }
  }
</style>
