# Deploy на Amvera

## 1) Подготовка репозитория
- Репозиторий: `https://github.com/limslava/report`
- Ветка для деплоя: `main`
- CI уже настроен в `.github/workflows/ci.yml` (проверка сборки frontend/backend).

Критично:
- В Amvera production должно быть выбрано слежение за `main`.
- Если Amvera фактически деплоит `master` (старый коммит), сайт может отдавать `502` даже при успешной сборке.

## 2) Что развернуть
- `backend` как отдельный сервис Node.js
- `frontend` как отдельный сервис Node.js (сборка + статика)
- PostgreSQL и Redis как отдельные managed сервисы/контейнеры

## 3) Переменные окружения backend
Обязательные:
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

Проверка порта:
- В `amvera.yml` и `amvera.yaml` должно быть `run.containerPort: 3000`.
- `APP_PORT` и `containerPort` должны совпадать.

## 4) Переменные окружения frontend
- `VITE_API_BASE_URL` (если используете абсолютный URL API)

## 5) Минимальный post-deploy check
0. В build-логе проверить `HEAD is now at <sha>` — это должен быть ожидаемый коммит.
1. Открыть `/health` backend — должен быть `200`.
2. Войти в систему админом.
3. Проверить: `Показатели` -> загрузка, сохранение.
4. Проверить: `Операционный отчет`, `Сводный отчет`.
5. Проверить `Настройки` -> SMTP test -> тестовая отправка.
6. Проверить планировщик рассылки (создать тестовое расписание и выполнить тест).

Если видим `502`:
1. Сверить ветку в настройках Amvera (`main` для production).
2. Сверить SHA в build-логе с SHA в GitHub.
3. Проверить `APP_PORT=3000` и `containerPort: 3000`.
4. Учесть, что `npm error signal SIGTERM` при перезапуске обычно норма.

## 6) Рекомендация по релизам
- Мержи в `main` только через Pull Request.
- Перед деплоем проверять зелёный CI.
- Использовать теги релизов (`v1.0.0`, `v1.0.1`).

## 7) Кэш фронтенда (авто‑обновление)
Чтобы пользователи автоматически получали новую версию:
- `index.html` → `Cache-Control: no-cache`
- `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`

Эти заголовки уже выставляются backend’ом при раздаче `frontend/dist`.
