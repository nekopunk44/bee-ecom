<script lang="ts">
  /**
   * Число в соте: новые заказы в меню и в уведомлениях. Размер задаётся классом,
   * а не встроенным стилем: встроенные стили запрещает политика безопасности.
   */
  let {
    value,
    size = 'md',
    tone = 'honey',
  }: {
    value: number | string;
    size?: 'sm' | 'md' | 'lg';
    tone?: 'honey' | 'ink' | 'muted';
  } = $props();
</script>

<span class="hex {size} {tone}" aria-hidden="true">
  <svg viewBox="0 0 30 34"
    ><polygon points="15,1 29,9 29,25 15,33 1,25 1,9"></polygon></svg
  >
  <b>{value}</b>
</span>

<style>
  .hex {
    position: relative;
    display: inline-grid;
    flex: none;
    place-items: center;
  }
  .hex svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .hex b {
    position: relative;
    font-weight: 800;
    line-height: 1;
  }
  .sm {
    width: 1.25rem;
    height: 1.4rem;
    font-size: 0.6875rem;
  }
  .md {
    width: 1.5rem;
    height: 1.7rem;
    font-size: 0.75rem;
  }
  .lg {
    width: 3.25rem;
    height: 3.65rem;
    font-family: var(--font-display);
    font-size: 1.25rem;
  }
  .honey polygon {
    fill: var(--color-honey);
  }
  .honey b {
    color: var(--color-ink);
  }
  .ink polygon {
    fill: var(--color-ink);
  }
  .ink b {
    color: var(--color-honey);
  }
  .muted polygon {
    fill: var(--color-line);
  }
  .muted b {
    color: var(--color-muted);
  }
</style>
