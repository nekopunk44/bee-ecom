<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { createApiClient, type components } from '@bee/api-client';
  import type { Locale } from '../i18n';
  import { onSession, signIn } from '../lib/sign-in';
  import { formatMoney } from '../lib/money';
  import { deliveryLabels, type DeliveryMethod } from '../lib/orders';
  let { locale }: { locale: Locale } = $props();
  type Checkout = components['schemas']['Checkout'];
  type Field =
    | 'deliveryMethod'
    | 'warehouseId'
    | 'locality'
    | 'address'
    | 'postalCode'
    | 'recipientName'
    | 'phone'
    | 'comment';
  const api = createApiClient();
  const copy = {
    ru: {
      loading: 'Готовим оформление заказа…',
      signIn: 'Войдите в аккаунт, чтобы оформить заказ.',
      account: 'Войти',
      empty: 'В корзине нет товаров — оформлять пока нечего.',
      browse: 'Перейти в каталог',
      failed: 'Не удалось загрузить данные заказа. Попробуйте ещё раз.',
      retry: 'Повторить',
      delivery: 'Способ получения',
      deliveryNotes: {
        courier: 'Привезём по указанному адресу.',
        pickup: 'Заберёте сами, когда заказ соберут.',
        post: 'Отправим почтой в ваш населённый пункт.',
      },
      noPickup: 'Сейчас ни на одном складе нет всех товаров из корзины.',
      warehouse: 'Склад',
      notReady: 'не все товары в наличии',
      locality: 'Населённый пункт',
      address: 'Адрес',
      addressHint: 'Улица, дом, квартира',
      postalCode: 'Почтовый индекс',
      optional: 'необязательно',
      recipient: 'Получатель',
      recipientName: 'Имя и фамилия',
      phone: 'Телефон',
      phoneHint: 'Молдавский номер, например +373 69 123 456',
      comment: 'Комментарий к заказу',
      payment: 'Оплата',
      paymentNote:
        'При получении, наличными или картой. Онлайн-оплату пока не принимаем.',
      summary: 'Ваш заказ',
      items: 'Товары',
      shipping: 'Доставка',
      free: 'Бесплатно',
      courierLater: 'Стоимость сообщим при подтверждении',
      postLater: 'По тарифу почты, при получении',
      total: 'Итого',
      totalPlusDelivery: 'плюс доставка',
      short: (available: number) =>
        available < 1 ? 'Нет в наличии' : `Доступно только ${available}`,
      editCart: 'Изменить корзину',
      submit: 'Подтвердить заказ',
      submitting: 'Оформляем…',
      errors: {
        INVALID_DELIVERY: 'Выберите способ получения.',
        INVALID_WAREHOUSE: 'Выберите склад, на котором есть все товары.',
        INVALID_LOCALITY: 'Укажите населённый пункт.',
        INVALID_ADDRESS: 'Укажите адрес: улицу и дом.',
        INVALID_POSTAL_CODE: 'Индекс состоит из четырёх цифр, например 2001.',
        INVALID_RECIPIENT: 'Укажите имя получателя.',
        INVALID_PHONE: 'Укажите молдавский номер, например +373 69 123 456.',
        INVALID_COMMENT: 'Комментарий не длиннее 500 символов.',
      },
      stock:
        'Наличие изменилось, пока вы оформляли заказ. Проверьте товары и попробуйте снова.',
      placed:
        'Похоже, этот заказ уже оформлен. Проверьте список заказов, прежде чем оформлять ещё раз.',
      orders: 'Мои заказы',
      forbidden: 'Запрос отклонён: источник не прошёл проверку безопасности.',
      network:
        'Нет ответа от сервера. Повторите отправку — заказ не задвоится.',
      submitFailed: 'Не удалось оформить заказ. Попробуйте ещё раз.',
    },
    ro: {
      loading: 'Pregătim plasarea comenzii…',
      signIn: 'Autentifică-te pentru a plasa comanda.',
      account: 'Intră în cont',
      empty: 'Coșul este gol — deocamdată nu ai ce comanda.',
      browse: 'Deschide catalogul',
      failed: 'Datele comenzii nu au putut fi încărcate. Încearcă din nou.',
      retry: 'Reîncearcă',
      delivery: 'Modul de primire',
      deliveryNotes: {
        courier: 'Livrăm la adresa indicată.',
        pickup: 'O ridici singur, după ce comanda este pregătită.',
        post: 'Expediem prin poștă în localitatea ta.',
      },
      noPickup: 'Momentan niciun depozit nu are toate produsele din coș.',
      warehouse: 'Depozit',
      notReady: 'nu toate produsele sunt în stoc',
      locality: 'Localitatea',
      address: 'Adresa',
      addressHint: 'Strada, numărul casei, apartamentul',
      postalCode: 'Codul poștal',
      optional: 'opțional',
      recipient: 'Destinatar',
      recipientName: 'Numele și prenumele',
      phone: 'Telefon',
      phoneHint: 'Număr din Moldova, de exemplu +373 69 123 456',
      comment: 'Comentariu la comandă',
      payment: 'Plata',
      paymentNote:
        'La primire, numerar sau cu cardul. Plata online nu este disponibilă deocamdată.',
      summary: 'Comanda ta',
      items: 'Produse',
      shipping: 'Livrare',
      free: 'Gratuit',
      courierLater: 'Costul îl comunicăm la confirmare',
      postLater: 'Conform tarifului poștal, la primire',
      total: 'Total',
      totalPlusDelivery: 'plus livrarea',
      short: (available: number) =>
        available < 1 ? 'Indisponibil' : `Disponibil doar ${available}`,
      editCart: 'Modifică coșul',
      submit: 'Confirmă comanda',
      submitting: 'Plasăm comanda…',
      errors: {
        INVALID_DELIVERY: 'Alege modul de primire.',
        INVALID_WAREHOUSE: 'Alege un depozit care are toate produsele.',
        INVALID_LOCALITY: 'Indică localitatea.',
        INVALID_ADDRESS: 'Indică adresa: strada și numărul casei.',
        INVALID_POSTAL_CODE: 'Codul poștal are patru cifre, de exemplu 2001.',
        INVALID_RECIPIENT: 'Indică numele destinatarului.',
        INVALID_PHONE:
          'Indică un număr din Moldova, de exemplu +373 69 123 456.',
        INVALID_COMMENT: 'Comentariul are cel mult 500 de caractere.',
      },
      stock:
        'Stocul s-a schimbat cât timp plasai comanda. Verifică produsele și încearcă din nou.',
      placed:
        'Se pare că această comandă a fost deja plasată. Verifică lista comenzilor înainte de a comanda din nou.',
      orders: 'Comenzile mele',
      forbidden:
        'Cererea a fost respinsă deoarece originea nu este de încredere.',
      network:
        'Serverul nu răspunde. Trimite din nou — comanda nu se va dubla.',
      submitFailed: 'Comanda nu a putut fi plasată. Încearcă din nou.',
    },
  }[locale];
  // Код ошибки API → поле формы, рядом с которым показываем подсказку.
  const fieldOf: Record<string, Field> = {
    INVALID_DELIVERY: 'deliveryMethod',
    INVALID_WAREHOUSE: 'warehouseId',
    INVALID_LOCALITY: 'locality',
    INVALID_ADDRESS: 'address',
    INVALID_POSTAL_CODE: 'postalCode',
    INVALID_RECIPIENT: 'recipientName',
    INVALID_PHONE: 'phone',
    INVALID_COMMENT: 'comment',
  };
  const methods: DeliveryMethod[] = ['courier', 'pickup', 'post'];

  let checkout = $state<Checkout | null>(null);
  let loading = $state(true);
  let authRequired = $state(false);
  let loadError = $state('');
  let method = $state<DeliveryMethod>('courier');
  let form = $state({
    warehouseId: '',
    locality: '',
    address: '',
    postalCode: '',
    recipientName: '',
    phone: '',
    comment: '',
  });
  let invalid = $state<{ field: Field; message: string } | null>(null);
  let submitError = $state('');
  let showOrders = $state(false);
  let busy = $state(false);
  // Один ключ на одну попытку заказа: повтор после обрыва связи не создаст второй заказ.
  // Новый ключ берём только после того, как сервер точно отказал.
  let idempotencyKey = '';

  let readyWarehouses = $derived(
    (checkout?.warehouses ?? []).filter((warehouse) => warehouse.ready),
  );
  let shortItems = $derived(
    (checkout?.cart.items ?? []).filter(
      (item) => item.available < item.quantity,
    ),
  );
  let deliveryMinor = $derived(
    method === 'pickup'
      ? 0
      : method === 'courier'
        ? (checkout?.courierPriceMinor ?? null)
        : null,
  );

  // Итог плавно досчитывает, когда меняется способ доставки.
  const shownTotal = Tween.of(
    () => (checkout?.itemsTotalMinor ?? 0) + (deliveryMinor ?? 0),
    {
      duration: () => (prefersReducedMotion.current ? 0 : 420),
      easing: cubicOut,
    },
  );
  const reveal = { duration: 280, easing: cubicOut };

  async function load() {
    loading = true;
    loadError = '';
    authRequired = false;
    try {
      const result = await api.GET('/api/v1/checkout', {
        params: { query: { locale } },
        signal: AbortSignal.timeout(10000),
      });
      if (result.error) {
        authRequired = result.response.status === 401;
        loadError = authRequired ? '' : copy.failed;
        return;
      }
      checkout = result.data;
      if (!readyWarehouses.some(({ id }) => id === form.warehouseId))
        form.warehouseId = readyWarehouses[0]?.id ?? '';
      if (method === 'pickup' && !readyWarehouses.length) method = 'courier';
    } catch {
      loadError = copy.failed;
    } finally {
      loading = false;
    }
  }

  function describedBy(field: Field, hint?: string) {
    return (
      [hint, invalid?.field === field ? 'checkout-error' : '']
        .filter(Boolean)
        .join(' ') || undefined
    );
  }

  async function focusInvalid(field: Field) {
    await tick();
    const target =
      field === 'deliveryMethod'
        ? document.querySelector<HTMLInputElement>('input[name="delivery"]')
        : document.getElementById(`checkout-${field}`);
    target?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    invalid = null;
    submitError = '';
    showOrders = false;
    idempotencyKey ||= crypto.randomUUID();
    const body = {
      deliveryMethod: method,
      recipientName: form.recipientName,
      phone: form.phone,
      ...(method === 'pickup' ? { warehouseId: form.warehouseId } : {}),
      ...(method === 'post' ? { locality: form.locality } : {}),
      ...(method === 'pickup' ? {} : { address: form.address }),
      ...(method === 'post' && form.postalCode.trim()
        ? { postalCode: form.postalCode }
        : {}),
      ...(form.comment.trim() ? { comment: form.comment } : {}),
    };
    try {
      const result = await api.POST('/api/v1/orders', {
        params: {
          header: { 'Idempotency-Key': idempotencyKey },
          query: { locale },
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
      if (!result.error) {
        window.location.assign(`/${locale}/orders/${result.data.id}/?placed=1`);
        return;
      }
      const code = result.error.error.code;
      if (result.response.status === 401) {
        authRequired = true;
        return;
      }
      // Сервер отказал до создания заказа, ключ можно сменить.
      idempotencyKey = '';
      if (code in fieldOf) {
        const field = fieldOf[code]!;
        invalid = {
          field,
          message: copy.errors[code as keyof typeof copy.errors],
        };
        await focusInvalid(field);
      } else if (
        code === 'CART_EMPTY' ||
        code === 'ITEM_UNAVAILABLE' ||
        code === 'INVENTORY_NOT_AVAILABLE'
      ) {
        submitError = copy.stock;
        await load();
      } else if (code === 'IDEMPOTENCY_CONFLICT') {
        submitError = copy.placed;
        showOrders = true;
      } else if (code === 'ORIGIN_REJECTED') {
        submitError = copy.forbidden;
      } else {
        submitError = copy.submitFailed;
      }
    } catch {
      // Ответа нет: заказ мог создаться, поэтому ключ сохраняем для повтора.
      submitError = copy.network;
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void load();
    // Вошёл или вышел в окне аккаунта — данные перечитываются без перезагрузки.
    return onSession(() => void load());
  });
</script>

<div class="checkout">
  {#if loading && !checkout}<p class="state shimmer" aria-live="polite">
      {copy.loading}
    </p>
  {:else if authRequired}
    <div class="state">
      <p>{copy.signIn}</p>
      <button
        class="button"
        type="button"
        onclick={(event) => void signIn(event.currentTarget)}
        >{copy.account}</button
      >
    </div>
  {:else if loadError && !checkout}
    <div class="state">
      <p role="alert">{loadError}</p>
      <button class="button" onclick={load}>{copy.retry}</button>
    </div>
  {:else if !checkout?.cart.items.length}
    <div class="state">
      <p>{copy.empty}</p>
      <a class="button honey" href={`/${locale}/catalog/`}>{copy.browse}</a>
    </div>
  {:else}
    <form class="layout" onsubmit={submit}>
      <div class="steps">
        <fieldset aria-describedby={describedBy('deliveryMethod')}>
          <legend>{copy.delivery}</legend>
          <div class="methods">
            {#each methods as option (option)}
              <label
                class="method"
                class:disabled={option === 'pickup' && !readyWarehouses.length}
              >
                <input
                  type="radio"
                  name="delivery"
                  value={option}
                  bind:group={method}
                  disabled={option === 'pickup' && !readyWarehouses.length}
                />
                <span>
                  <strong>{deliveryLabels[locale][option]}</strong>
                  <small
                    >{option === 'pickup' && !readyWarehouses.length
                      ? copy.noPickup
                      : copy.deliveryNotes[option]}</small
                  >
                </span>
              </label>
            {/each}
          </div>

          {#if method === 'pickup'}
            <div class="fields" in:slide={reveal}>
              <label for="checkout-warehouseId">{copy.warehouse}</label>
              <select
                id="checkout-warehouseId"
                required
                bind:value={form.warehouseId}
                aria-invalid={invalid?.field === 'warehouseId' || undefined}
                aria-describedby={describedBy('warehouseId')}
              >
                {#each checkout.warehouses as warehouse (warehouse.id)}
                  <option value={warehouse.id} disabled={!warehouse.ready}
                    >{warehouse.ready
                      ? warehouse.name
                      : `${warehouse.name} — ${copy.notReady}`}</option
                  >
                {/each}
              </select>
            </div>
          {:else}
            <div class="fields" in:slide={reveal}>
              {#if method === 'post'}
                <div class="fields" transition:slide={reveal}>
                  <label for="checkout-locality">{copy.locality}</label>
                  <input
                    id="checkout-locality"
                    autocomplete="address-level2"
                    required
                    minlength="2"
                    maxlength="120"
                    bind:value={form.locality}
                    aria-invalid={invalid?.field === 'locality' || undefined}
                    aria-describedby={describedBy('locality')}
                  />
                </div>
              {/if}
              <label for="checkout-address">{copy.address}</label>
              <input
                id="checkout-address"
                autocomplete="street-address"
                required
                minlength="5"
                maxlength="240"
                placeholder={copy.addressHint}
                bind:value={form.address}
                aria-invalid={invalid?.field === 'address' || undefined}
                aria-describedby={describedBy('address')}
              />
              {#if method === 'post'}
                <div class="fields" transition:slide={reveal}>
                  <label for="checkout-postalCode"
                    >{copy.postalCode} <span>({copy.optional})</span></label
                  >
                  <input
                    id="checkout-postalCode"
                    class="short"
                    autocomplete="postal-code"
                    inputmode="numeric"
                    maxlength="16"
                    placeholder="MD-2001"
                    bind:value={form.postalCode}
                    aria-invalid={invalid?.field === 'postalCode' || undefined}
                    aria-describedby={describedBy('postalCode')}
                  />
                </div>
              {/if}
            </div>
          {/if}
        </fieldset>

        <fieldset>
          <legend>{copy.recipient}</legend>
          <label for="checkout-recipientName">{copy.recipientName}</label>
          <input
            id="checkout-recipientName"
            autocomplete="name"
            required
            minlength="2"
            maxlength="120"
            bind:value={form.recipientName}
            aria-invalid={invalid?.field === 'recipientName' || undefined}
            aria-describedby={describedBy('recipientName')}
          />
          <label for="checkout-phone">{copy.phone}</label>
          <input
            id="checkout-phone"
            type="tel"
            autocomplete="tel"
            required
            maxlength="32"
            placeholder="+373 69 123 456"
            bind:value={form.phone}
            aria-invalid={invalid?.field === 'phone' || undefined}
            aria-describedby={describedBy('phone', 'checkout-phone-hint')}
          />
          <small id="checkout-phone-hint" class="hint">{copy.phoneHint}</small>
          <label for="checkout-comment"
            >{copy.comment} <span>({copy.optional})</span></label
          >
          <textarea
            id="checkout-comment"
            rows="3"
            maxlength="500"
            bind:value={form.comment}
            aria-invalid={invalid?.field === 'comment' || undefined}
            aria-describedby={describedBy('comment')}></textarea>
        </fieldset>

        <section class="payment" aria-labelledby="checkout-payment">
          <h2 id="checkout-payment">{copy.payment}</h2>
          <p>{copy.paymentNote}</p>
        </section>
      </div>

      <aside class="summary" aria-labelledby="checkout-summary">
        <h2 id="checkout-summary">{copy.summary}</h2>
        <ul>
          {#each checkout.cart.items as item (item.variantId)}
            <li>
              <span>
                {item.name}
                <small>{item.variantName} × {item.quantity}</small>
                {#if item.available < item.quantity}<small class="warning"
                    >{copy.short(item.available)}</small
                  >{/if}
              </span>
              <strong
                >{formatMoney(
                  locale,
                  item.unitPriceMinor * item.quantity,
                )}</strong
              >
            </li>
          {/each}
        </ul>
        {#if shortItems.length}
          <a class="edit" href={`/${locale}/cart/`}>{copy.editCart}</a>
        {/if}
        <dl>
          <div>
            <dt>{copy.items}</dt>
            <dd>{formatMoney(locale, checkout.itemsTotalMinor)}</dd>
          </div>
          <div>
            <dt>{copy.shipping}</dt>
            <dd>
              {#key method}<span in:fade={{ duration: 220 }}
                  >{deliveryMinor === 0
                    ? copy.free
                    : deliveryMinor !== null
                      ? formatMoney(locale, deliveryMinor)
                      : method === 'courier'
                        ? copy.courierLater
                        : copy.postLater}</span
                >{/key}
            </dd>
          </div>
          <div class="total">
            <dt>{copy.total}</dt>
            <dd>
              {formatMoney(locale, Math.round(shownTotal.current))}
              {#if deliveryMinor === null}<small
                  transition:fade={{ duration: 200 }}
                  >{copy.totalPlusDelivery}</small
                >{/if}
            </dd>
          </div>
        </dl>
        <div aria-live="assertive">
          {#if invalid}
            <p id="checkout-error" class="error" in:fly={{ y: -6, ...reveal }}>
              {invalid.message}
            </p>
          {:else if submitError}
            <p class="error" in:fly={{ y: -6, ...reveal }}>{submitError}</p>
            {#if showOrders}<a href={`/${locale}/orders/`}>{copy.orders}</a
              >{/if}
          {/if}
        </div>
        <button class="button honey" class:busy disabled={busy}
          >{busy ? copy.submitting : copy.submit}</button
        >
      </aside>
    </form>
  {/if}
</div>

<style>
  .checkout {
    padding-top: var(--space-lg);
  }
  .state {
    display: grid;
    justify-items: start;
    gap: var(--space-md);
    max-width: 40rem;
    margin: 0;
    padding: var(--space-lg);
    border-radius: var(--radius-md);
    background: var(--color-sand);
    font-weight: 600;
  }
  .state p {
    margin: 0;
  }
  .layout {
    display: grid;
    gap: var(--space-xl);
  }
  .steps {
    display: grid;
    gap: var(--space-lg);
  }
  fieldset {
    display: grid;
    gap: var(--space-xs);
    min-width: 0;
    margin: 0;
    padding: var(--space-lg);
    border: 2px solid var(--color-line);
    border-radius: var(--radius-lg);
    background: var(--color-paper);
  }
  legend,
  h2 {
    margin: 0;
    padding: 0;
    font-family: var(--font-display);
    font-size: 1.375rem;
    letter-spacing: -0.02em;
  }
  legend {
    float: left;
    width: 100%;
    margin-bottom: var(--space-sm);
  }
  label:not(.method) span {
    color: var(--color-muted);
    font-weight: 400;
  }
  /* Подпись и пометка «необязательно» — одной строкой, а не сеткой из base.css. */
  label:not(.method) {
    display: block;
    margin: var(--space-sm) 0 0;
  }
  .methods {
    display: grid;
    gap: var(--space-xs);
  }
  .fields {
    display: grid;
    gap: var(--space-xs);
  }
  .method {
    transition:
      border-color var(--motion-normal) var(--ease-standard),
      background-color var(--motion-normal) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 2px solid var(--color-line);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .method:has(input:checked) {
    border-color: var(--color-ink);
    background: var(--color-honey-soft);
  }
  .method:not(.disabled):hover {
    border-color: var(--color-muted);
  }
  .method:not(.disabled):active {
    transform: scale(0.99);
  }
  .method.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .method input {
    width: auto;
    margin-top: 0.3rem;
    accent-color: var(--color-ink);
  }
  .method span {
    display: grid;
    gap: 0.1rem;
  }
  .method small,
  .hint {
    color: var(--color-muted);
    font-size: var(--text-sm);
    font-weight: 400;
  }
  input,
  select,
  textarea {
    width: 100%;
  }
  .short {
    max-width: 12rem;
  }
  [aria-invalid='true'] {
    border-color: var(--color-danger);
    animation: shake 360ms var(--ease-standard);
  }
  .busy {
    animation: pending 900ms var(--ease-in-out) infinite;
  }
  @keyframes pending {
    50% {
      opacity: 0.75;
    }
  }
  .payment {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    background: var(--color-sand);
  }
  .payment p {
    margin: 0;
  }
  .summary {
    display: grid;
    gap: var(--space-md);
    align-content: start;
    padding-top: var(--space-md);
    border-top: 2px solid var(--color-ink);
  }
  .summary ul {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .summary li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .summary li span {
    display: grid;
    font-weight: 600;
  }
  .summary li small {
    color: var(--color-muted);
    font-size: var(--text-sm);
    font-weight: 400;
  }
  .summary li .warning {
    color: var(--color-danger);
    font-weight: 600;
  }
  .summary li strong {
    white-space: nowrap;
  }
  .edit {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  dl {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--color-line);
  }
  dl div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-sm);
  }
  dt {
    color: var(--color-muted);
  }
  dd {
    margin: 0;
    text-align: right;
    font-weight: 600;
  }
  .total dd {
    display: grid;
    font-family: var(--font-display);
    font-size: 1.75rem;
    letter-spacing: -0.03em;
  }
  .total small {
    color: var(--color-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 400;
    letter-spacing: 0;
  }
  .error {
    margin: 0;
    color: var(--color-danger);
    font-weight: 600;
  }
  .summary .button {
    width: 100%;
  }
  @media (min-width: 64rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr) 24rem;
      align-items: start;
    }
    .summary {
      position: sticky;
      top: var(--space-md);
    }
  }
</style>
