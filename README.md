# Bee — платформа магазина оборудования для пчеловодства

Монорепозиторий: **Astro SSR + Svelte 5**, отдельная **Svelte SPA** для управления,
**C++23 / Drogon**, PostgreSQL, Redis и S3-совместимое хранилище.

Реализованы инфраструктурная основа и первый сквозной этап каталога: RU/RO-витрина,
поиск и фильтры, карточки товаров, вход администратора, редактор товаров и загрузка
изображений. Корзина, платежи и складские операции относятся к следующим этапам.
[Возможности и ограничения каталога](docs/architecture/catalog.md).

## Требования

- Node.js 22.12+ (CI/Docker: 22.22.0), npm 10+.
- Docker Engine с Compose v2 либо Docker Desktop с Linux containers.
- Для сборки C++ без контейнера: Linux, GCC 14+, CMake 3.25+, Drogon 1.9.11,
  JsonCpp, OpenSSL, libpq, hiredis, zlib, uuid, libsodium, libvips и libcurl.
- Первый Docker build собирает Drogon из исходников и занимает несколько минут.

## Запуск всего стека

```sh
npm ci
npm run setup
docker compose up --build -d --wait --wait-timeout 180
npm run test:stack
```

`setup` создаёт `.env` со случайными локальными паролями, сохраняет существующие
значения и добавляет недостающие ключи. Не добавляйте `.env` в Git.

| Адрес                                     | Назначение                           |
| ----------------------------------------- | ------------------------------------ |
| http://localhost:8080/ru/                 | Витрина на русском                   |
| http://localhost:8080/ro/                 | Витрина на румынском                 |
| http://admin.localhost:8080               | Отдельная админка                    |
| http://localhost:8080/api/v1/health/live  | API liveness                         |
| http://localhost:8080/api/v1/health/ready | PostgreSQL/schema + Redis readiness  |
| http://localhost:9001                     | MinIO console, данные входа в `.env` |

Если ОС не разрешает `admin.localhost`, добавьте `127.0.0.1 admin.localhost` в
локальный hosts. PostgreSQL и Redis не публикуют порты на хост. HTTP-стек и MinIO
console доступны только через loopback. Compose автоматически запускает миграции
и создаёт приватный bucket с версионированием.

```sh
docker compose ps
docker compose logs -f api worker nginx
docker compose run --rm migrate
docker compose down
```

`down` сохраняет данные в named volumes. Изменение `.env` не меняет автоматически
пароль уже созданной базы PostgreSQL. Подробности: [эксплуатация](docs/architecture/operations.md).

## Первый вход в админку

После запуска стека выполните `./infra/scripts/create-admin.ps1` в PowerShell.
Скрипт запросит email и пароль; учётных данных по умолчанию нет. В админке сначала
создайте категорию в справочниках, затем товар с переводами RU/RO и вариантом.
Статус `active` публикует товар на витрине. Подробности и вариант для Linux:
[каталог](docs/architecture/catalog.md).

## Разработка frontend без Docker

```sh
npm ci
npm run dev:storefront
```

В другом терминале: `npm run dev:admin`. Адреса: http://127.0.0.1:4321 и
http://127.0.0.1:5173. Без API админка показывает ошибку подключения. Vite
проксирует `/api` на `http://127.0.0.1:8080`; override: `API_PROXY_TARGET`.

Страницы витрины отдаются сервером без клиентского JavaScript. Svelte integration
подключена для будущих островков. Весь storefront не превращается в SPA.

## Проверки

```sh
npm run generate:api
npm run format:check
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
```

`check` проверяет OpenAPI, Svelte, Astro и TypeScript. `test` выполняет SQL каталога
в PGlite и проверяет защиту истории миграций. Playwright проверяет SSR без JS, языки,
мобильную ширину, клавиатуру, 404 и состояния админки. В этих UI-тестах API
подменяется; настоящий Drogon проверяется через `test:stack` после Compose.

Backend Docker build запускает CMake + CTest. CI дополнительно собирает все
контейнеры, запускает smoke-проверки, повтор миграций и отключение/восстановление
Redis и PostgreSQL. Фактические результаты локальной проверки и ограничения
среды перечислены в [validation.md](docs/architecture/validation.md).

## Структура и контракты

```text
apps/          storefront (Astro), admin (Svelte/Vite)
services/      api (Drogon), worker (outbox)
packages/      contracts (OpenAPI), api-client (generated types), ui (CSS tokens)
database/      migrations, seeds, docs
infra/         docker, nginx, scripts, monitoring
docs/          architecture, adr
tests/         migration planner tests, frontend E2E
.github/       CI
```

[OpenAPI](packages/contracts/openapi.yaml) — источник API-контрактов.
`npm run generate:api` обновляет TypeScript-типы; вручную их не редактируют.
CI проверяет отсутствие рассинхронизации. Ошибки API имеют
`error.code`, `error.message`, `error.requestId`; ответы содержат `X-Request-Id`.

SQL-миграции неизменяемы, проверяются SHA-256 и выполняются транзакционно под
advisory lock. [Правила миграций](database/docs/migrations.md).

## Документация и следующий этап

- [Аудит исходного состояния](docs/architecture/current-state.md)
- [Архитектура и границы модулей](docs/architecture/overview.md)
- [Этапы реализации](docs/architecture/milestones.md)
- [Архитектурные решения](docs/adr/)
- [Эксплуатация, резервирование и развёртывание](docs/architecture/operations.md)

Следующие задачи: завершить управление справочниками и жизненный цикл медиа,
затем перейти к корзине, заказам, складу и платежам. Производственный
запуск требует прохождения Milestone 5 и проверки восстановления из резервной
копии; текущий Compose предназначен для разработки.
