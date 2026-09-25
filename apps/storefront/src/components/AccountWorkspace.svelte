<script lang="ts">
  import { onMount } from 'svelte';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  type Session = components['schemas']['Session'];
  let { locale }: { locale: Locale } = $props();
  const api = createApiClient();
  const copy = $derived(
    {
      ru: {
        login: 'Вход',
        register: 'Создать аккаунт',
        email: 'Электронная почта',
        password: 'Пароль',
        submitLogin: 'Войти',
        submitRegister: 'Зарегистрироваться',
        signedIn: 'Вы вошли как',
        logout: 'Выйти',
        account: 'Аккаунт покупателя',
        welcome: 'После входа здесь будут ваши заказы и данные профиля.',
        unavailable: 'Этот адрес уже зарегистрирован.',
        invalid: 'Проверьте адрес почты и пароль.',
        forbidden: 'Запрос отклонён: источник не прошёл проверку безопасности.',
        failed: 'Не удалось выполнить запрос. Повторите попытку позже.',
      },
      ro: {
        login: 'Autentificare',
        register: 'Creează cont',
        email: 'E-mail',
        password: 'Parolă',
        submitLogin: 'Intră în cont',
        submitRegister: 'Înregistrează-te',
        signedIn: 'Autentificat ca',
        logout: 'Ieșire',
        account: 'Cont client',
        welcome:
          'După autentificare, aici vor apărea comenzile și datele profilului.',
        unavailable: 'Această adresă este deja înregistrată.',
        invalid: 'Verifică adresa și parola.',
        forbidden:
          'Cererea a fost respinsă deoarece originea nu este de încredere.',
        failed: 'Cererea nu a reușit. Încearcă din nou mai târziu.',
      },
    }[locale],
  );
  let mode = $state<'login' | 'register'>('login'),
    session = $state<Session | null>(null),
    email = $state(''),
    password = $state(''),
    busy = $state(false),
    error = $state('');
  async function refresh() {
    const result = await api.GET('/api/v1/auth/session', {
      signal: AbortSignal.timeout(7000),
    });
    session = result.data ?? null;
  }
  onMount(() => {
    void refresh().catch(() => (session = null));
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      if (mode === 'register') {
        const result = await api.POST('/api/v1/auth/register', {
          body: { email: email.trim(), password },
          signal: AbortSignal.timeout(15000),
        });
        if (result.error) {
          error =
            result.error.error.code === 'EMAIL_UNAVAILABLE'
              ? copy.unavailable
              : result.error.error.code === 'ORIGIN_REJECTED'
                ? copy.forbidden
                : copy.failed;
          return;
        }
      } else {
        const result = await api.POST('/api/v1/auth/login', {
          body: { email: email.trim(), password },
          signal: AbortSignal.timeout(15000),
        });
        if (result.error) {
          error =
            result.error.error.code === 'ORIGIN_REJECTED'
              ? copy.forbidden
              : result.error.error.code === 'INVALID_CREDENTIALS'
                ? copy.invalid
                : copy.failed;
          return;
        }
      }
      password = '';
      await refresh();
    } catch {
      error = copy.failed;
    } finally {
      busy = false;
    }
  }
  async function logout() {
    busy = true;
    error = '';
    try {
      const result = await api.POST('/api/v1/auth/logout', {
        signal: AbortSignal.timeout(7000),
      });
      if (result.error) {
        error = copy.failed;
        return;
      }
      session = null;
    } catch {
      error = copy.failed;
    } finally {
      busy = false;
    }
  }
</script>

<section class="account" aria-labelledby="account-heading">
  <h1 id="account-heading">{copy.account}</h1>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if session}
    <p>{copy.signedIn} <strong>{session.email}</strong>.</p>
    <p>{copy.welcome}</p>
    <button class="button" onclick={logout} disabled={busy}
      >{copy.logout}</button
    >
  {:else}
    <div class="tabs" aria-label={copy.account}>
      <button aria-pressed={mode === 'login'} onclick={() => (mode = 'login')}
        >{copy.login}</button
      ><button
        aria-pressed={mode === 'register'}
        onclick={() => (mode = 'register')}>{copy.register}</button
      >
    </div>
    <form onsubmit={submit}>
      <label
        >{copy.email}<input
          type="email"
          autocomplete="email"
          required
          maxlength="254"
          bind:value={email}
        /></label
      >
      <label
        >{copy.password}<input
          type="password"
          autocomplete={mode === 'register'
            ? 'new-password'
            : 'current-password'}
          required
          minlength={mode === 'register' ? 12 : 1}
          maxlength={mode === 'register' ? 128 : 256}
          bind:value={password}
        /></label
      >
      <button class="button" disabled={busy}
        >{mode === 'register' ? copy.submitRegister : copy.submitLogin}</button
      >
    </form>
  {/if}
</section>

<style>
  .account {
    max-width: 34rem;
    margin: var(--space-xl) auto;
    padding: var(--space-lg);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
  }
  .tabs,
  form {
    display: grid;
    gap: var(--space-md);
  }
  .tabs {
    grid-template-columns: 1fr 1fr;
    margin-block: var(--space-lg);
  }
  .tabs button[aria-pressed='true'] {
    background: var(--color-forest);
    color: var(--color-surface);
  }
  label {
    display: grid;
    gap: var(--space-xs);
  }
  input {
    min-height: 2.75rem;
    padding: var(--space-sm);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-sm);
    background: white;
    color: var(--color-ink);
  }
  [role='alert'] {
    color: var(--color-danger);
  }
</style>
