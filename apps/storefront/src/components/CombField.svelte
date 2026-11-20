<script lang="ts">
  import { onMount } from 'svelte';
  import { mountCombField } from '../lib/comb-field';

  let canvas = $state<HTMLCanvasElement>();
  onMount(() => (canvas ? mountCombField(canvas) : undefined));
</script>

<canvas bind:this={canvas} class="comb" aria-hidden="true" data-comb-field
></canvas>

<style>
  /* Цвет пустых ячеек: чуть темнее песочного фона пустого состояния. */
  .comb {
    display: block;
    width: 100%;
    height: 9rem;
    border-radius: var(--radius-sm);
    color: #e7dfc9;
    touch-action: pan-y;
  }
</style>
