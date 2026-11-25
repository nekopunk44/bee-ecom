<script lang="ts">
  import { api, errorText } from '../lib/catalog';
  let {
    title,
    error: initial = '',
    onSignedIn,
  }: { title: string; error?: string; onSignedIn: () => void } = $props();
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  const shown = $derived(error || initial);

  async function login(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const result = await api.POST('/api/v1/auth/login', {
        body: { email, password },
        signal: AbortSignal.timeout(10000),
      });
      password = '';
      if (result.error) error = errorText(result.error.error.code);
      else onSignedIn();
    } catch {
      error = errorText();
    } finally {
      busy = false;
    }
  }
</script>

<form class="login" onsubmit={login}>
  <h1>{title}</h1>
  <p class="lead">Доступ выдаёт администратор магазина.</p>
  {#if shown}<p class="message error" role="alert">{shown}</p>{/if}
  <label class="field"
    >Электронная почта<input
      required
      type="email"
      autocomplete="username"
      bind:value={email}
    /></label
  >
  <label class="field"
    >Пароль<input
      required
      type="password"
      autocomplete="current-password"
      bind:value={password}
    /></label
  >
  <button class="btn honey submit" disabled={busy}
    >{busy ? 'Подключаемся…' : 'Войти'}</button
  >
</form>

<style>
  .login {
    display: grid;
    gap: var(--space-md);
    width: min(26rem, 100%);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    background: var(--color-paper);
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.625rem;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
  .lead {
    margin: -0.5rem 0 0;
    color: var(--color-muted);
    font-size: 0.9375rem;
  }
  .message {
    margin: 0;
  }
  .submit {
    min-height: 3rem;
    margin-top: var(--space-xs);
    font-size: 1rem;
  }
</style>
