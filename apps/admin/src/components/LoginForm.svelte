<script lang="ts">
  import { onMount } from 'svelte';
  import { api, errorText } from '../lib/catalog';
  let {
    title,
    error: initial = '',
    leaving = false,
    onSignedIn,
  }: {
    title: string;
    error?: string;
    // Вход удался: карточка сворачивается в соту, прежде чем откроется админка.
    leaving?: boolean;
    onSignedIn: () => void;
  } = $props();
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  const shown = $derived(error || initial);
  // Пока карточка раскрывается, поля встают по очереди; ошибка после попытки входа
  // появляется сразу.
  let ready = $state(false);
  onMount(() => {
    const timer = setTimeout(() => (ready = true), 1200);
    return () => clearTimeout(timer);
  });

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

<form
  class="login"
  data-ready={ready ? '' : undefined}
  data-leaving={leaving ? '' : undefined}
  onsubmit={login}
>
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
    animation: cell-open 640ms both;
    display: grid;
    gap: var(--space-md);
    width: min(26rem, 100%);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    background: var(--color-paper);
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%);
  }
  /* Карточка вырастает сотой посередине экрана и раскрывается, содержимое встаёт
     по очереди; при входе всё сворачивается обратно (кадры в @bee/ui/cell.css). */
  .login[data-leaving] {
    animation: cell-close 440ms both;
  }
  .login:not([data-ready]) > * {
    animation: cell-content-in 460ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(330ms + var(--n, 0) * 50ms);
  }
  .login > :nth-child(2) {
    --n: 1;
  }
  .login > :nth-child(3) {
    --n: 2;
  }
  .login > :nth-child(4) {
    --n: 3;
  }
  .login > :nth-child(5) {
    --n: 4;
  }
  .login > :nth-child(6) {
    --n: 5;
  }
  /* Ошибка после попытки входа не ждёт очереди, а коротко вздрагивает. */
  .login[data-ready] > .message {
    animation: shake 360ms var(--ease-standard);
  }
  .login[data-leaving] > *,
  .login[data-leaving][data-ready] > .message {
    animation: cell-content-out 110ms ease-in both;
  }
  @keyframes shake {
    20%,
    60% {
      translate: -5px 0;
    }
    40%,
    80% {
      translate: 5px 0;
    }
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
