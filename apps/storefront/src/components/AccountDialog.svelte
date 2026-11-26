<script lang="ts">
  import { tick } from 'svelte';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  type Session = components['schemas']['Session'];
  /*
   * Аккаунт поверх текущей страницы. Значок в шапке остаётся обычной ссылкой на
   * /account: без JavaScript он туда и ведёт, а с ним скрипт шапки загружает это
   * окно при первом нажатии (lib/account-dialog) и вызывает open().
   */
  let { locale }: { locale: Locale } = $props();
  const api = createApiClient();
  const copy = {
    ru: {
      title: 'Аккаунт',
      welcome:
        'Войдите, чтобы собирать корзину, оформлять заказы и следить за ними.',
      login: 'Вход',
      register: 'Создать аккаунт',
      google: 'Войти через Google',
      or: 'или по почте',
      email: 'Электронная почта',
      password: 'Пароль',
      show: 'Показать пароль',
      hide: 'Скрыть пароль',
      rule: 'Не короче 12 символов',
      submitLogin: 'Войти',
      submitRegister: 'Создать аккаунт',
      signedIn: 'Вы вошли',
      orders: 'Мои заказы',
      cart: 'Корзина',
      favorites: 'Избранное',
      logout: 'Выйти',
      close: 'Закрыть',
      unavailable:
        'Этот адрес уже зарегистрирован. Войдите или войдите через Google.',
      invalid: 'Проверьте адрес почты и пароль.',
      weak: 'Пароль должен быть не короче 12 символов.',
      limited: 'Слишком много попыток. Попробуйте через 15 минут.',
      failed: 'Не удалось выполнить запрос. Повторите попытку позже.',
      googleFailed:
        'Не получилось войти через Google. Попробуйте ещё раз или войдите по почте.',
      googleOff: 'Вход через Google пока не подключён.',
    },
    ro: {
      title: 'Cont',
      welcome:
        'Intră în cont ca să adaugi în coș, să plasezi comenzi și să le urmărești.',
      login: 'Autentificare',
      register: 'Creează cont',
      google: 'Continuă cu Google',
      or: 'sau cu e-mail',
      email: 'E-mail',
      password: 'Parolă',
      show: 'Arată parola',
      hide: 'Ascunde parola',
      rule: 'Cel puțin 12 caractere',
      submitLogin: 'Intră în cont',
      submitRegister: 'Creează cont',
      signedIn: 'Ești autentificat',
      orders: 'Comenzile mele',
      cart: 'Coș',
      favorites: 'Favorite',
      logout: 'Ieșire',
      close: 'Închide',
      unavailable:
        'Această adresă este deja înregistrată. Intră în cont sau continuă cu Google.',
      invalid: 'Verifică adresa și parola.',
      weak: 'Parola trebuie să aibă cel puțin 12 caractere.',
      limited: 'Prea multe încercări. Reîncearcă peste 15 minute.',
      failed: 'Cererea nu a reușit. Încearcă din nou mai târziu.',
      googleFailed:
        'Autentificarea cu Google nu a reușit. Încearcă din nou sau intră cu e-mail.',
      googleOff: 'Autentificarea cu Google nu este încă activă.',
    },
  }[locale];

  let dialog = $state<HTMLDialogElement>();
  let mode = $state<'login' | 'register'>('login');
  let session = $state<Session | null>(null);
  let google = $state(false);
  let email = $state('');
  let password = $state('');
  let visible = $state(false);
  let busy = $state(false);
  let error = $state('');
  let justSignedIn = $state(false);
  let checked = false;
  // Куда вернуться после Google: эта же страница, без пометки о прошлом входе.
  let back = $state(`/${locale}/`);
  // Значок, из которого окно вылетает сотой и в который возвращается.
  let origin: Element | null = null;
  // Раскрытие или сворачивание окна: от него зависят анимации (data-phase).
  let phase = $state<'opening' | 'closing' | null>(null);
  // Каждое открытие отменяет закрытие, которое ещё доигрывает анимацию.
  let run = 0;

  /** Смещение от центра окна до значка: окно стоит по центру экрана. */
  function aim() {
    const box = origin?.getBoundingClientRect();
    const seen =
      box && box.width > 0 && box.bottom > 0 && box.top < innerHeight;
    const x = seen
      ? box.left + box.width / 2 - document.documentElement.clientWidth / 2
      : 0;
    const y = seen ? box.top + box.height / 2 - innerHeight / 2 : 0;
    // Через CSSOM, а не атрибутом style: встроенные стили запрещает CSP.
    dialog?.style.setProperty('--cell-x', `${Math.round(x)}px`);
    dialog?.style.setProperty('--cell-y', `${Math.round(y)}px`);
  }
  /** Закрытие: содержимое гаснет, карточка сворачивается в соту и улетает в значок. */
  async function dismiss() {
    if (!dialog?.open || phase === 'closing') return;
    const current = ++run;
    aim();
    phase = 'closing';
    await tick();
    const playing = dialog
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().endTime !== Infinity,
      )
      .map((animation) => animation.finished);
    await Promise.race([
      Promise.allSettled(playing),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
    if (current === run) dialog.close();
  }
  /** Окно закрылось (в том числе вторым Escape без анимации): значок ловит соту. */
  function landed() {
    phase = null;
    if (!(origin instanceof HTMLElement)) return;
    // Чтение размера между снятием и возвратом класса перезапускает анимацию.
    origin.classList.remove('bump');
    void origin.offsetWidth;
    origin.classList.add('bump');
  }

  function mark() {
    for (const trigger of document.querySelectorAll('[data-account-trigger]'))
      trigger.toggleAttribute('data-signed-in', Boolean(session));
  }
  async function check() {
    try {
      const [current, providers] = await Promise.all([
        api.GET('/api/v1/auth/session', { signal: AbortSignal.timeout(7000) }),
        checked
          ? Promise.resolve(null)
          : api.GET('/api/v1/auth/providers', {
              signal: AbortSignal.timeout(7000),
            }),
      ]);
      session = current.data ?? null;
      if (providers) google = providers.data?.google ?? false;
      checked = true;
      mark();
    } catch {
      // Нет связи: окно всё равно покажет формы, ошибка будет при отправке.
    }
  }
  /**
   * outcome — итог входа через Google, если человек только что вернулся оттуда;
   * from — нажатый значок (без него окно вылетает из значка в шапке).
   */
  export async function open(outcome?: string | null, from?: Element | null) {
    error = '';
    justSignedIn = false;
    origin = from ?? document.querySelector('header [data-account-trigger]');
    const params = new URLSearchParams(location.search);
    params.delete('signin');
    const query = params.toString();
    back = location.pathname + (query ? `?${query}` : '');
    await tick();
    const current = ++run;
    if (dialog) {
      aim();
      phase = 'opening';
      await tick();
      if (!dialog.open) dialog.showModal();
      // Пока окно раскрывается, содержимое встаёт по очереди; то, что появится
      // позже (ошибка, меню после входа), показывается сразу, без очереди.
      setTimeout(() => {
        if (current === run && phase === 'opening') phase = null;
      }, 1200);
    }
    await check();
    if (outcome === 'google') justSignedIn = Boolean(session);
    else if (outcome)
      error = outcome === 'google-off' ? copy.googleOff : copy.googleFailed;
    await tick();
    dialog?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const body = { email: email.trim(), password };
      const result =
        mode === 'register'
          ? await api.POST('/api/v1/auth/register', {
              body,
              signal: AbortSignal.timeout(15000),
            })
          : await api.POST('/api/v1/auth/login', {
              body,
              signal: AbortSignal.timeout(15000),
            });
      if (result.error) {
        const code = result.error.error.code;
        error =
          code === 'EMAIL_UNAVAILABLE'
            ? copy.unavailable
            : code === 'INVALID_CREDENTIALS'
              ? copy.invalid
              : code === 'INVALID_REGISTRATION'
                ? copy.weak
                : code === 'RATE_LIMITED'
                  ? copy.limited
                  : copy.failed;
        return;
      }
      password = '';
      session = { email: result.data.email, permissions: [] };
      justSignedIn = true;
      mark();
      document.dispatchEvent(new CustomEvent('bee:session'));
      // Остаёмся на странице: окно само закрывается, когда человек увидел, что вошёл.
      setTimeout(() => {
        if (justSignedIn) void dismiss();
      }, 1400);
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
      justSignedIn = false;
      mark();
      document.dispatchEvent(new CustomEvent('bee:session'));
    } catch {
      error = copy.failed;
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="account-dialog"
  data-phase={phase}
  aria-labelledby="account-dialog-title"
  onclick={(event) => {
    // Нажатие по затемнению вокруг окна закрывает его.
    if (event.target === dialog) void dismiss();
  }}
  oncancel={(event) => {
    // Escape закрывает с той же анимацией, что и крестик.
    event.preventDefault();
    void dismiss();
  }}
  onclose={landed}
>
  <div class="card">
    <header>
      <svg
        class="mark"
        width="34"
        height="38"
        viewBox="0 0 30 34"
        aria-hidden="true"
      >
        <polygon points="15,1 29,9 29,25 15,33 1,25 1,9"></polygon>
        {#if session}<path d="M9.5 17.5l3.8 3.8 7.2-7.6"></path>{/if}
      </svg>
      <h2 id="account-dialog-title">{session ? copy.signedIn : copy.title}</h2>
      <button
        class="close"
        type="button"
        aria-label={copy.close}
        onclick={() => void dismiss()}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M6 6l12 12M18 6 6 18"></path></svg
        >
      </button>
    </header>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if session}
      <div class="signed" class:fresh={justSignedIn}>
        <p class="who">
          <span class="avatar" aria-hidden="true"
            >{session.email.charAt(0).toUpperCase()}</span
          >
          <span>{session.email}</span>
        </p>
        <nav>
          <a href={`/${locale}/orders/`}>{copy.orders}</a>
          <a href={`/${locale}/cart/`}>{copy.cart}</a>
          <a href={`/${locale}/favorites/`}>{copy.favorites}</a>
        </nav>
        <button class="logout" type="button" onclick={logout} disabled={busy}
          >{copy.logout}</button
        >
      </div>
    {:else}
      <p class="lead">{copy.welcome}</p>
      <div class="tabs" role="group" aria-label={copy.title}>
        <button
          type="button"
          aria-pressed={mode === 'login'}
          onclick={() => {
            mode = 'login';
            error = '';
          }}>{copy.login}</button
        >
        <button
          type="button"
          aria-pressed={mode === 'register'}
          onclick={() => {
            mode = 'register';
            error = '';
          }}>{copy.register}</button
        >
      </div>
      {#if google}
        <a
          class="google"
          href={`/api/v1/auth/google/start?return=${encodeURIComponent(back)}`}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
            ></path>
            <path
              fill="#4285F4"
              d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
            ></path>
            <path
              fill="#FBBC05"
              d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
            ></path>
            <path
              fill="#34A853"
              d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
            ></path>
          </svg>
          {copy.google}
        </a>
        <p class="or"><span>{copy.or}</span></p>
      {/if}
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
          >{copy.password}<span class="password"
            ><input
              type={visible ? 'text' : 'password'}
              autocomplete={mode === 'register'
                ? 'new-password'
                : 'current-password'}
              required
              minlength={mode === 'register' ? 12 : undefined}
              aria-describedby={mode === 'register'
                ? 'password-rule'
                : undefined}
              maxlength="128"
              bind:value={password}
            /><button
              type="button"
              aria-label={visible ? copy.hide : copy.show}
              aria-pressed={visible}
              onclick={() => (visible = !visible)}
              ><svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                aria-hidden="true"
                ><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
                ></path><circle cx="12" cy="12" r="3"
                ></circle>{#if visible}<path d="M4 20 20 4"></path>{/if}</svg
              ></button
            ></span
          ></label
        >
        {#if mode === 'register'}<small id="password-rule">{copy.rule}</small
          >{/if}
        <button class="submit" type="submit" disabled={busy}
          >{mode === 'register'
            ? copy.submitRegister
            : copy.submitLogin}</button
        >
      </form>
    {/if}
  </div>
</dialog>

<style>
  /* Окно аккаунта: белая карточка поверх затемнённой страницы, вход по почте и через Google. */
  .account-dialog {
    width: min(26rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--color-paper);
    color: var(--color-ink);
    box-shadow: 0 2rem 5rem rgb(23 21 15 / 30%);
    overflow: auto;
  }
  /* Затемнение с медовыми сотами: проступает и чуть оседает, пока окно летит. */
  .account-dialog::backdrop {
    background: rgb(23 21 15 / 60%)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97'%3E%3Cpath d='M28 0 56 16v32L28 64 0 48V16zM28 64v33M0 97V81l28-17 28 17v16' fill='none' stroke='%23f5b700' stroke-opacity='.13'/%3E%3C/svg%3E")
      center / 56px 97px;
    backdrop-filter: blur(4px);
  }
  .account-dialog[open]::backdrop {
    animation: backdrop-in 520ms var(--ease-out) both;
  }
  .account-dialog[open][data-phase='closing']::backdrop {
    animation: cell-fade-out 440ms cubic-bezier(0.4, 0, 0.6, 1) both;
  }
  @keyframes backdrop-in {
    from {
      opacity: 0;
      backdrop-filter: blur(0);
      background-size: 84px 145.5px;
    }
  }
  /* Окно вылетает сотой из нажатого значка (--cell-x и --cell-y ставит aim()),
     раскрывается в карточку, а при закрытии сворачивается и улетает обратно
     (кадры в @bee/ui/cell.css). */
  .account-dialog[open] {
    animation: cell-open 640ms both;
  }
  .account-dialog[open][data-phase='closing'] {
    animation: cell-close 440ms both;
  }
  .account-dialog[data-phase='opening'] .card > * {
    animation: cell-content-in 460ms var(--ease-out) both;
    animation-delay: calc(330ms + var(--n, 0) * 50ms);
  }
  .card > :nth-child(2) {
    --n: 1;
  }
  .card > :nth-child(3) {
    --n: 2;
  }
  .card > :nth-child(4) {
    --n: 3;
  }
  .card > :nth-child(5) {
    --n: 4;
  }
  .card > :nth-child(6) {
    --n: 5;
  }
  .card > :nth-child(7) {
    --n: 6;
  }
  .account-dialog[data-phase='opening'] .mark {
    animation: cell-mark-in 700ms var(--ease-spring) 300ms both;
  }
  /* Ошибка, которая появилась позже, коротко вздрагивает (shake из motion.css). */
  .card > .error {
    animation: shake 360ms var(--ease-standard);
  }
  .account-dialog[data-phase='closing'] .card > * {
    animation: cell-content-out 110ms ease-in both;
  }
  .card {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .mark {
    flex: none;
  }
  .mark polygon {
    fill: var(--color-honey);
  }
  .mark path {
    fill: none;
    stroke: var(--color-ink);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 20;
    animation: draw 500ms var(--ease-out) 150ms both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 20;
    }
  }
  h2 {
    flex: 1;
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
  .close {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--color-sand);
    color: var(--color-ink);
  }
  .close svg,
  .password svg {
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .close:hover {
    background: var(--color-line);
  }
  .lead {
    margin: calc(var(--space-sm) * -1) 0 0;
    color: var(--color-muted);
    font-size: 0.9375rem;
  }
  .error {
    margin: 0;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-sm);
    background: #fbe9e7;
    color: var(--color-danger);
    font-size: 0.9375rem;
    font-weight: 600;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: var(--radius-pill);
    background: var(--color-sand);
  }
  .tabs button {
    min-height: 2.5rem;
    padding: 0 0.5rem;
    white-space: nowrap;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    font-size: 0.9375rem;
    font-weight: 700;
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  .tabs button[aria-pressed='true'] {
    background: var(--color-ink);
    color: #ffffff;
  }
  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: 3rem;
    border: 2px solid var(--color-line);
    border-radius: var(--radius-pill);
    color: var(--color-ink);
    font-weight: 700;
    text-decoration: none;
    transition: border-color var(--motion-fast) var(--ease-standard);
  }
  .google:hover {
    border-color: var(--color-ink);
  }
  .or {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }
  .or::before,
  .or::after {
    flex: 1;
    height: 1px;
    background: var(--color-line);
    content: '';
  }
  form {
    display: grid;
    gap: var(--space-sm);
  }
  label {
    margin: 0;
    font-size: 0.875rem;
  }
  input {
    width: 100%;
  }
  small {
    margin-top: -0.4rem;
    color: var(--color-muted);
    font-size: 0.8125rem;
  }
  .password {
    position: relative;
    display: block;
  }
  .password input {
    padding-right: 3rem;
  }
  .password button {
    position: absolute;
    top: 50%;
    right: 0.4rem;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-muted);
    translate: 0 -50%;
  }
  .password button:hover {
    color: var(--color-ink);
  }
  .submit {
    min-height: 3rem;
    margin-top: var(--space-xs);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--color-honey);
    color: var(--color-ink);
    font-weight: 800;
  }
  .submit:hover {
    background: #e6ab00;
  }
  .signed {
    display: grid;
    gap: var(--space-md);
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--color-ink);
    color: var(--color-honey);
    font-family: var(--font-display);
    font-weight: 800;
  }
  .fresh .avatar {
    animation: pop 480ms var(--ease-out);
  }
  @keyframes pop {
    40% {
      scale: 1.2;
    }
  }
  nav {
    display: grid;
    gap: 0.25rem;
  }
  nav a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 3rem;
    padding: 0 1rem;
    border-radius: var(--radius-sm);
    background: var(--color-sand);
    font-weight: 600;
    text-decoration: none;
  }
  nav a::after {
    width: 0.5rem;
    height: 0.5rem;
    border-top: 2px solid var(--color-muted);
    border-right: 2px solid var(--color-muted);
    content: '';
    rotate: 45deg;
  }
  nav a:hover {
    background: var(--color-honey-soft);
  }
  .logout {
    justify-self: start;
    border: 0;
    background: transparent;
    color: var(--color-muted);
    font-weight: 600;
    text-decoration: underline;
  }
  /* Остальные анимации гасит общее правило base.css; затемнение под него не попадает. */
  @media (prefers-reduced-motion: reduce) {
    .account-dialog[open]::backdrop,
    .account-dialog[open][data-phase='closing']::backdrop {
      animation: none;
    }
  }
</style>
