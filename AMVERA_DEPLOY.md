# Deploy на Amvera

## 1) Подготовка репозитория
- Репозиторий: `https://github.com/limslava/report`
- Ветка для stage: `develop`
- Ветка для production: `main`
- CI уже настроен в `.github/workflows/ci.yml` (проверка сборки frontend/backend).

## 2) Что развернуть
- Текущее приложение разворачивается как один Docker-сервис по корневому
  `Dockerfile`.
- Backend запускает API, WebSocket, scheduler и раздаёт собранный frontend из
  `frontend/dist`.
- PostgreSQL разворачивается отдельным managed-сервисом.
- Redis опционален: если `SCHEDULER_USE_QUEUE=false`, scheduler работает
  локальным in-process fallback и Redis не обязателен.

## 3) Переменные окружения backend
Все переменные добавляются в Amvera на этап `Запуск`.

Обязательные для `report-stage`:

```env
NODE_ENV=production
APP_PORT=3000

JWT_SECRET=<strong-secret>
JWT_EXPIRES_IN=7d
INVITE_ONLY=true
TRUST_PROXY=1

DB_HOST=<postgres-host>
DB_PORT=5432
DB_DATABASE=<database>
DB_USERNAME=<user>
DB_PASSWORD=<password>

FRONTEND_URL=https://report-stage-limslava.amvera.io
CORS_ALLOWED_ORIGINS=https://report-stage-limslava.amvera.io

UPLOAD_PATH=/data/uploads
WAREHOUSE_UPLOAD_PATH=/data/warehouse
WAREHOUSE_PHOTO_BACKUP_PATH=/data/warehouse-photo-backup
WAREHOUSE_TUS_TEMP_PATH=/data/warehouse-tus-temp
WAREHOUSE_PENDING_UPLOAD_TTL_HOURS=24
WAREHOUSE_TUS_CLEANUP_MAX_AGE_HOURS=24
WAREHOUSE_TUS_CLEANUP_INTERVAL_HOURS=1

SCHEDULER_ENABLED=true
SCHEDULER_USE_QUEUE=false
SCHEDULER_INTERVAL_MINUTES=5
SCHEDULER_TIMEZONE=Asia/Vladivostok
REDIS_ENABLED=false
```

Временная настройка для первого запуска stage после добавления складского
модуля:

```env
DB_SYNCHRONIZE=true
DB_MIGRATIONS_RUN=false
```

Она нужна, если в логах есть ошибка вида:

```text
column User.warehouse_client_id does not exist
```

После стабилизации stage и подготовки миграций вернуться к:

```env
DB_SYNCHRONIZE=false
DB_MIGRATIONS_RUN=true
```

Для production `DB_SYNCHRONIZE=true` не использовать.

Секретами в Amvera отмечать:

- `JWT_SECRET`
- `DB_USERNAME`
- `DB_PASSWORD`
- `REDIS_PASSWORD`, если используется Redis
- `SMTP_PASSWORD`, если используется SMTP

SMTP, если нужны email-уведомления:

```env
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASSWORD=<smtp-password>
SMTP_FROM=<from-email>
```

Устаревшая схема с отдельными сервисами backend/frontend больше не является
основной для этого проекта.

<!-- Historical reference:
- `NODE_ENV=production`
- `APP_PORT=3000`
- `JWT_SECRET=<strong-secret>`
- `CORS_ALLOWED_ORIGINS=<frontend-domain>`
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `INVITE_ONLY=true`

Опционально:
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`
- `LOG_LEVEL=info`
- `JWT_EXPIRES_IN=7d`
- `TRUST_PROXY=1`
-->

## 4) Переменные окружения frontend
Для текущей Docker-схемы отдельные frontend-переменные не нужны: frontend
использует относительный `/api`.

Если frontend когда-либо будет собираться отдельным сервисом, используйте:

```env
VITE_API_URL=https://<backend-domain>/api
VITE_IDLE_TIMEOUT_MIN=60
```

Не использовать `VITE_API_BASE_URL`: такой переменной в коде нет.

## 5) Минимальный post-deploy check
1. Открыть `/health` backend — должен быть `200`.
2. Открыть `/health/db` — должен быть `200`.
3. Открыть `/health/scheduler` — должен быть `200`.
4. Войти в систему админом.
5. Проверить: `Показатели` -> загрузка, сохранение.
6. Проверить: `Операционный отчет`, `Сводный отчет`.
7. Проверить склад:
   - `/warehouse` открывается;
   - кладовщик проходит приёмку ТС с фото;
   - доп. услуга добавляется;
   - выдача ТС проходит;
   - финансист видит начисления;
   - представитель контрагента видит только свои ТС.
8. Если SMTP настроен: `Настройки` -> SMTP test -> тестовая отправка.
9. Если scheduler нужен: проверить планировщик рассылки.

## 6) Рекомендация по релизам
- Мержи в `main` только через Pull Request.
- Перед деплоем проверять зелёный CI.
- Использовать теги релизов (`v1.0.0`, `v1.0.1`).

## 7) Кэш фронтенда (авто‑обновление)
Чтобы пользователи автоматически получали новую версию:
- `index.html` → `Cache-Control: no-cache`
- `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`

Эти заголовки уже выставляются backend’ом при раздаче `frontend/dist`.
