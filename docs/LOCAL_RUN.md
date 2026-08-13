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
# 1. База (копия прода от 12.08.2026) и Redis
docker start report_prod_check logistics_redis
```

База `report_prod_check` — PostgreSQL 17 на порту **5434** с копией продовых
данных (дамп от 12.08.2026, файл `~/Desktop/report_prod.dump`). Настройки
подключения уже в `backend/.env`. Прежняя пустая база (`logistics_postgres`,
порт 5433) сохранена — вернуться на неё можно, восстановив `backend/.env.local-backup`.

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

Локальная база — **копия прода**, поэтому подходят ваши обычные продовые
логины/пароли (изменения при этом остаются только локально и на прод не
влияют).

## Полезное

- Таблицы создаются автоматически при старте бэкенда (`synchronize: true`) —
  миграций руками гонять не нужно.
- Проверить, что бэкенд жив: http://localhost:3001/health → `{"status":"OK"}`.
- Остановить: `Ctrl+C` в обоих терминалах; Docker-контейнеры можно не гасить
  (или `docker stop logistics_postgres logistics_redis`).
- Если порт занят (3001/5173) — найти процесс: `lsof -nP -iTCP:3001 -sTCP:LISTEN`.

## Бэкапы прода и восстановление

Ежедневный автоматический бэкап продовой БД настроен на Mac владельца:

- скрипт `~/bin/report-pg-backup.sh` (запуск — launchd
  `com.report.pg-backup`, ежедневно в 10:30, при пропуске — после
  пробуждения мака);
- копии: iCloud Drive → `ReportBackups/daily` (30 дней) и
  `ReportBackups/monthly` (первый дамп месяца, ~13 месяцев), журнал —
  `ReportBackups/backup.log`;
- схема подключения: socat-туннель `TCP-LISTEN:15544 → OPENSSL:
  reportdb-limslava.db-msk0.amvera.tech:5432` (ингресс Amvera не пропускает
  postgres-ALPN напрямую), пароль — в `~/.pgpass`;
- при ошибке скрипт показывает уведомление macOS «Бэкап Report: ОШИБКА».

Восстановление дампа (пример — в локальную копию прода):

```bash
docker exec report_prod_check psql -U postgres -c 'DROP DATABASE IF EXISTS report_prod' \
  && docker exec report_prod_check psql -U postgres -c 'CREATE DATABASE report_prod'
/opt/homebrew/opt/libpq/bin/pg_restore -h 127.0.0.1 -p 5434 -U postgres \
  -d report_prod --no-owner "путь/к/report_prod_ДАТА.dump"
```

Восстановление НА ПРОД — только осознанно и через тот же socat-туннель
(`pg_restore -h 127.0.0.1 -p 15544 -U limslava -d Report --clean --no-owner`);
перед этим обязательно снять свежий дамп текущего состояния.
