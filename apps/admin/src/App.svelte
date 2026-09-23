<script lang="ts">
  import { createApiClient } from '@bee/api-client';
  import CatalogWorkspace from './components/CatalogWorkspace.svelte';
  const api = createApiClient();
  let busy = $state(false);
  let status = $state('Проверка ещё не выполнялась.');
  let requestId = $state('');

  async function checkReadiness() {
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

<a class="skip-link" href="#main">Перейти к содержимому</a>
<header class="container">
  <strong>bee<span> / управление</span></strong><span class="eyebrow"
    >Каталог</span
  >
</header>
<main id="main" class="container">
  <p class="eyebrow">Управление магазином</p>
  <h1>Рабочее пространство Bee</h1>
  <p class="intro">Товары, переводы, варианты и изображения вашего магазина.</p>
  <CatalogWorkspace />
  <details>
    <summary>Проверка подключения</summary>
    <section aria-labelledby="connection-heading">
      <h2 id="connection-heading">Подключение к API</h2>
      <p role="status" aria-live="polite">{status}</p>
      {#if requestId}<p class="request-id">Код запроса: {requestId}</p>{/if}
      <button class="button" onclick={checkReadiness} disabled={busy}
        >{busy ? 'Проверяем…' : 'Проверить подключение'}</button
      >
    </section>
  </details>
</main>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    justify-content: space-between;
    align-items: center;
    padding-block: var(--space-lg);
    border-bottom: 1px solid var(--color-line);
  }
  header strong {
    font-size: 1.75rem;
  }
  header strong span {
    font-size: var(--text-body);
    font-weight: 400;
    color: var(--color-muted);
  }
  main {
    padding-block: var(--space-xl);
  }
  h1 {
    font-family: var(--font-display);
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 400;
    line-height: 1.15;
  }
  .intro {
    max-width: 45rem;
    color: var(--color-muted);
  }
  section {
    max-width: 48rem;
    margin-block: var(--space-xl);
    padding: var(--space-lg);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  h2 {
    margin-top: 0;
    font-size: 1.25rem;
  }
  .request-id {
    font-family: monospace;
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }
</style>
