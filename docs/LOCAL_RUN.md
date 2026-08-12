# Локальный запуск проекта

Проверено на macOS, папка `Report-fuel` (ветка `feature/fuel-module`).
Для других worktree-папок всё то же самое — меняется только путь.

## Что нужно один раз

1. **Docker Desktop** — запущен.
2. **Node.js 18+**.
3. **Файл настроек бэкенда** — если `backend/.env` отсутствует, скопировать из
   основной копии:

   ```bash
   cp ../Report/backend/.env backend/.env
   ```

   (или из `backend/.env.example`, заполнив доступы к БД: host `localhost`,
   port `5433`, user/password `postgres`, база `logistics_reporting`).
4. **Зависимости** — если в `backend/node_modules` и `frontend/node_modules`
   пусто:

   ```bash
   npm install --prefix backend && npm install --prefix frontend
   ```

## Запуск (каждый раз)

Из папки `Report-fuel`:

```bash
# 1. База и Redis (контейнеры уже созданы, просто поднять)
docker start logistics_postgres logistics_redis
```

Если контейнеров ещё нет — создать из compose:
`docker compose -f backend/docker-compose.yml up -d`

```bash
# 2. Бэкенд (порт 3001) — оставить работать в этом окне терминала
npm run dev --prefix backend
```

```bash
# 3. Фронтенд (порт 5173) — во втором окне терминала
npm run dev --prefix frontend
```

Открыть **http://localhost:5173**.

## Вход

Локальная база живёт в Docker и не связана со стейджем/продом — пароли свои.
Локальный админ:

- **Email:** `admin@local.test`
- **Пароль:** `AdminLocal123!`

## Полезное

- Таблицы создаются автоматически при старте бэкенда (`synchronize: true`) —
  миграций руками гонять не нужно.
- Проверить, что бэкенд жив: http://localhost:3001/health → `{"status":"OK"}`.
- Остановить: `Ctrl+C` в обоих терминалах; Docker-контейнеры можно не гасить
  (или `docker stop logistics_postgres logistics_redis`).
- Если порт занят (3001/5173) — найти процесс: `lsof -nP -iTCP:3001 -sTCP:LISTEN`.
