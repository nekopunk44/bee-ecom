<script lang="ts">
  /** Значки админки: тонкие линии 24×24, цвет берётся из текста. */
  const paths = {
    products:
      'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z M3.5 7.5 12 12l8.5-4.5 M12 12v9',
    orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3',
    inventory: 'M3 10 12 4l9 6v10H3z M7 20v-6h10v6 M7 17h10',
    references: 'M3 12V4h8l10 10-8 8z M7.5 8h.01',
    store:
      'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4 M10 17l5-5-5-5 M15 12H3',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
    plus: 'M12 5v14 M5 12h14',
    close: 'M6 6l12 12 M18 6 6 18',
    edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
    upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
    pulse: 'M3 12h4l2-6 4 12 2-6h6',
    image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5h.01',
    arrow: 'M9 6l6 6-6 6',
  } as const;
  let { name, size = 20 }: { name: keyof typeof paths; size?: number } =
    $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.9"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
