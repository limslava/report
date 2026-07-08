# Amvera Deploy Workflow

Этот документ фиксирует рабочий процесс деплоя для проекта в Amvera.

## 1. Ветки и окружения

- `develop` — стенд (stage), для проверки изменений.
- `main` — продакшен (production), только проверенные изменения.

Рекомендуемая привязка в Amvera:
- Stage-приложение следит за веткой `develop`.
- Production-приложение следит за веткой `main`.

## 2. Что делает Amvera после push

После обновления ветки Amvera автоматически:
1. Клонирует репозиторий.
2. Собирает образ по `Dockerfile`.
3. Запускает приложение в контейнере на порту `3000`.

Проект разворачивается как один Docker-контейнер: backend запускает Express API,
WebSocket и scheduler, а также раздаёт собранный frontend из `frontend/dist`.
Отдельный frontend-сервис на Amvera для текущей схемы не нужен.

Контейнер включает `LibreOffice Writer`: он нужен для серверного PDF-предпросмотра
загруженных файлов `.docx` в процессе согласования договоров. Оригинал `.docx`
не заменяется и скачивается без преобразования.

Вложения договоров и сгенерированные PDF-превью хранятся в
подключенном постоянном хранилище `/data/uploads` (`UPLOAD_PATH=/data/uploads`).
Это важно: каталог внутри контейнера не должен использоваться как постоянное
хранилище документов.

Фотографии складского модуля и временные TUS-загрузки также должны храниться
на постоянном томе `/data`, иначе при перезапуске контейнера можно потерять
незавершённые загрузки или файлы фотофиксации:

- `WAREHOUSE_UPLOAD_PATH=/data/warehouse`
- `WAREHOUSE_PHOTO_BACKUP_PATH=/data/warehouse-photo-backup`
- `WAREHOUSE_TUS_TEMP_PATH=/data/warehouse-tus-temp`

Важно: `npm error signal SIGTERM` во время переключения версии часто является нормальным завершением старого процесса при перезапуске старого Node-развертывания.

## 2.1. Переменные окружения для `report-stage`

Все переменные добавляются в Amvera в приложении `report-stage`:
`Переменные` → `Добавить переменные и секреты`. Этап — `Запуск`.

Минимальный набор для stage:

```env
NODE_ENV=production
APP_PORT=3000

JWT_SECRET=<секрет>
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

Секретами в Amvera должны быть как минимум:

- `JWT_SECRET`
- `DB_USERNAME`
- `DB_PASSWORD`
- `REDIS_PASSWORD`, если используется Redis
- `SMTP_PASSWORD`, если используется SMTP

Для первого запуска складского модуля на stage, где база уже существовала до
добавления склада, временно допускается:

```env
DB_SYNCHRONIZE=true
DB_MIGRATIONS_RUN=false
```

Именно это добавляет недостающие поля и таблицы склада, например
`users.warehouse_client_id`. После стабилизации схемы и перехода на TypeORM
migrations нужно вернуть:

```env
DB_SYNCHRONIZE=false
DB_MIGRATIONS_RUN=true
```

Для production `DB_SYNCHRONIZE=true` не использовать.

## 3. Базовый цикл разработки (develop)

```bash
git checkout develop
git pull origin develop
# изменения в коде
npm --prefix frontend run lint
npm --prefix backend run lint
npm --prefix frontend run build
npm --prefix backend run build
git add -A
git commit -m "<message>"
git push origin develop
```

После `git push origin develop` Amvera stage выполнит автосборку и автодеплой.

### Миграции БД для БП договоров

Перед проверкой новой версии БП на stage, а затем перед релизом в production,
нужно применить SQL-файлы из `backend/database/migrations` к базе
соответствующего окружения. Для текущего функционала в их числе:

- `20260525_contract_step_attachments.sql`
- `20260526_add_secretary_role.sql`
- `20260527_contract_approval_revisions.sql`
- `20260527_contract_approval_sla_two_days.sql`
- `20260527_contract_approval_decision_events.sql`

Последняя миграция добавляет неизменяемый журнал сохранений и изменений виз,
который отображается администратору в карточке договора. Перед выполнением SQL
в production необходимо сделать резервную копию БД.

Технический долг: перед дальнейшим развитием БП перевести изменения схемы на
единый механизм TypeORM migrations и отключить `synchronize: true` для
production. Это уменьшит риск неявного изменения схемы при старте контейнера.

## 4. Релиз в production (main)

После успешной проверки на stage:

```bash
git checkout main
git pull origin main
git merge --no-ff develop
git push origin main
```

После `git push origin main` Amvera production выполнит автосборку и автодеплой.

Если в build-логе виден старый SHA (например, `HEAD is now at 2d8fa35 ...`) вместо актуального SHA из `origin/main`, значит Amvera деплоит не ту ветку (обычно `master`).
Для принудительного нового билда и деплоя актуального `main` выполните:

```bash
git push amvera main:master
```

После этого проверьте, что в следующем build-логе `HEAD is now at <sha>` совпадает с `origin/main`.

## 5. Rollback (откат)

Предпочтительный безопасный откат:

```bash
git checkout <develop|main>
git pull origin <develop|main>
git revert <bad_commit_sha>
git push origin <develop|main>
```

Amvera поднимет новую сборку с откатом.

## 6. Проверка после деплоя

Минимум:
1. `/health/db` отвечает `200`.
2. Логин работает.
3. Критичные страницы открываются без ошибок.
4. WebSocket подключается (в логах видно `New WebSocket connection`).
5. Нет циклических перезапусков контейнера.
6. В карточке договора файл `.docx` открывается в виде PDF-превью, а действие
   `Скачать оригинал` отдает исходный `.docx`.
7. `/warehouse` открывается у ролей склада.
8. Кладовщик может пройти приёмку ТС с фото, добавить услугу и выполнить выдачу.
9. Финансист видит начисления склада по периоду.
10. Представитель контрагента видит только свои ТС и начисления.

Если в логах stage есть ошибка:

```text
column User.warehouse_client_id does not exist
```

значит база не обновлена под складской модуль. Для stage включите
`DB_SYNCHRONIZE=true`, перезапустите контейнер и после успешного запуска
запланируйте перевод схемы на миграции.

## 7. Частые вопросы

### Почему в логах есть `WebSocket disconnected` / `New WebSocket connection`?
Нормальное поведение при обновлении вкладки, переподключении клиента или перезапуске приложения.

### Почему есть предупреждения `deprecated` npm-пакетов?
Это предупреждения зависимостей, обычно не блокируют сборку. Устраняются отдельной задачей обновления зависимостей.

### Почему иногда сборка запускается повторно?
Amvera может перезапустить pipeline после неуспешной/прерванной попытки или повторного события обновления ветки.

## 8. Важное правило команды

Для обычной работы используем GitHub remote (`origin`):
- `git push origin develop` для stage
- `git push origin main` для production

### Обязательное правило для Amvera production

После каждого релиза в `main` всегда выполняем дополнительный push в Amvera:

```bash
git push amvera origin/main:master
```

Это обязательный шаг для данного проекта, чтобы Amvera гарантированно деплоила актуальный код из `main`.

Проверка после push:
- в build-логе Amvera строка `HEAD is now at <sha>` должна совпадать с SHA в `origin/main`.
