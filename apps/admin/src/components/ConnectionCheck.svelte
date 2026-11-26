<script lang="ts">
  import { createApiClient } from '@bee/api-client';
  import Icon from './Icon.svelte';
  /** Проверка, что API и его базы на связи. Свёрнута, пока её не откроют. */
  let { tone = 'light' }: { tone?: 'light' | 'dark' } = $props();
  const api = createApiClient();
  let busy = $state(false);
  let status = $state('Проверка ещё не выполнялась.');
  let requestId = $state('');

  async function check() {
    busy = true;
    requestId = '';
    try {
      const { data, error, response } = await api.GET('/api/v1/health/ready', {
        signal: AbortSignal.timeout(7000),
      });
      requestId = response.headers.get('X-Request-Id') ?? '';
      status =
        data?.status === 'ready'
          ? 'API готово к работе. PostgreSQL и Redis доступны.'
          : error
            ? 'API пока не готово. Проверьте состояние сервисов.'
            : 'Получен неожиданный ответ сервера.';
    } catch {
      status =
        'Не удалось связаться с API. Проверьте подключение и повторите попытку.';
    } finally {
      busy = false;
    }
  }
</script>

<details class:dark={tone === 'dark'}>
  <summary><Icon name="pulse" size={18} />Проверка подключения</summary>
  <div class="box">
    <p role="status" aria-live="polite">{status}</p>
    {#if requestId}<p class="request">Код запроса: {requestId}</p>{/if}
    <button class="btn small" type="button" onclick={check} disabled={busy}
      >{busy ? 'Проверяем…' : 'Проверить подключение'}</button
    >
  </div>
</details>

<style>
  details {
    font-size: 0.875rem;
  }
  summary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-muted);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    color: var(--color-ink);
  }
  .dark summary {
    color: var(--color-night-muted);
  }
  .dark summary:hover {
    color: #ffffff;
  }
  .box {
    display: grid;
    justify-items: start;
    gap: 0.5rem;
    margin-top: 0.6rem;
    padding: 0.8rem;
    border-radius: 0.75rem;
    background: var(--color-paper);
    color: var(--color-ink);
  }
  .box p {
    margin: 0;
  }
  .request {
    font-family: monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
</style>
