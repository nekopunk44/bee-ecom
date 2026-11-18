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
        cart: 'Открыть корзину',
        orders: 'Мои заказы',
        account: 'Аккаунт покупателя',
        welcome: 'Корзина и заказы привязаны к этому аккаунту.',
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
        cart: 'Deschide coșul',
        orders: 'Comenzile mele',
        account: 'Cont client',
        welcome: 'Coșul și comenzile sunt legate de acest cont.',
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

<section class="account" aria-label={copy.account}>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if session}
    <p class="who">{copy.signedIn} <strong>{session.email}</strong>.</p>
    <p>{copy.welcome}</p>
    <div class="links">
      <a class="button honey" href={`/${locale}/cart/`}>{copy.cart}</a>
      <a class="button ghost" href={`/${locale}/orders/`}>{copy.orders}</a>
      <button class="button ghost" onclick={logout} disabled={busy}
        >{copy.logout}</button
      >
    </div>
  {:else}
    <div class="tabs" role="group" aria-label={copy.account}>
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
    max-width: 32rem;
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    border: 2px solid var(--color-line);
    border-radius: var(--radius-lg);
    background: var(--color-paper);
  }
  .account > p {
    margin: 0 0 var(--space-sm);
  }
  .who {
    font-size: var(--text-lead);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
    margin-bottom: var(--space-md);
    padding: 0.3rem;
    border-radius: var(--radius-pill);
    background: var(--color-sand);
  }
  .tabs button {
    min-height: 2.75rem;
    padding-inline: var(--space-sm);
    border: 0;
    background: transparent;
  }
  .tabs button[aria-pressed='true'] {
    background: var(--color-ink);
    color: #ffffff;
  }
  form {
    display: grid;
    gap: var(--space-xs);
  }
  input {
    width: 100%;
  }
  form .button {
    margin-top: var(--space-sm);
  }
  [role='alert'] {
    color: var(--color-danger);
    font-weight: 600;
  }
</style>
