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
<header>
  <div class="container bar">
    <strong class="brand"
      ><svg width="26" height="29" viewBox="0 0 30 34" aria-hidden="true"
        ><polygon points="15,1 29,9 29,25 15,33 1,25 1,9" fill="#f5b700"
        ></polygon></svg
      >bee<span>управление</span></strong
    ><span class="section">Каталог</span>
  </div>
</header>
<main id="main" class="container">
  <p class="eyebrow">Управление магазином</p>
  <h1 class="display">Рабочее пространство Bee</h1>
  <p class="intro">
    Товары, переводы, изображения, остатки на складах и заказы покупателей.
  </p>
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
    background: var(--color-night);
    color: #ffffff;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm) var(--space-md);
    justify-content: space-between;
    align-items: center;
    padding-block: var(--space-md);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 1;
  }
  .brand span {
    margin-left: 0.35rem;
    font-family: var(--font-body);
    font-size: var(--text-body);
    font-weight: 500;
    letter-spacing: 0;
    color: var(--color-night-muted);
  }
  .section {
    padding: 0.4rem 0.9rem;
    border-radius: var(--radius-pill);
    background: var(--color-honey);
    color: var(--color-ink);
    font-size: var(--text-sm);
    font-weight: 700;
  }
  main {
    padding-block: var(--space-xl);
  }
  .eyebrow {
    margin: 0;
  }
  h1 {
    margin: var(--space-sm) 0 var(--space-sm);
    font-size: clamp(2rem, 4.4vw, 3rem);
    line-height: 1.05;
    letter-spacing: -0.04em;
  }
  .intro {
    max-width: 45rem;
    margin: 0;
    color: var(--color-muted);
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  section {
    max-width: 48rem;
    margin-block: var(--space-md) var(--space-xl);
    padding: var(--space-lg);
    border: 2px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-paper);
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
