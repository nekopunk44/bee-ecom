<script lang="ts">
  import { onMount } from 'svelte';
  import { createApiClient } from '@bee/api-client';
  /** Короткая строка о связи с сервером: проверяется при входе и раз в минуту. */
  const api = createApiClient();
  let state = $state<'checking' | 'ready' | 'down'>('checking');

  async function check() {
    try {
      const { data } = await api.GET('/api/v1/health/ready', {
        signal: AbortSignal.timeout(7000),
      });
      state = data?.status === 'ready' ? 'ready' : 'down';
    } catch {
      state = 'down';
    }
  }
  onMount(() => {
    void check();
    const timer = setInterval(() => void check(), 60000);
    return () => clearInterval(timer);
  });
</script>

<span class="status {state}" role="status" aria-live="polite">
  <span class="dot" aria-hidden="true"></span>
  {state === 'ready'
    ? 'Сервер на связи'
    : state === 'down'
      ? 'Нет связи с сервером'
      : 'Проверяем связь'}
</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--color-night-muted);
    font-size: 0.75rem;
  }
  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--color-night-line);
  }
  .ready .dot {
    background: var(--color-honey);
  }
  .down .dot {
    background: #f3b1a8;
  }
  .down {
    color: #f3b1a8;
  }
</style>
