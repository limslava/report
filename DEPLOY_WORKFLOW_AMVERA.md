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

Контейнер включает `LibreOffice Writer`: он нужен для серверного PDF-предпросмотра
загруженных файлов `.docx` в процессе согласования договоров. Оригинал `.docx`
не заменяется и скачивается без преобразования.

Вложения договоров и сгенерированные PDF-превью хранятся в
подключенном постоянном хранилище `/data/uploads` (`UPLOAD_PATH=/data/uploads`).
Это важно: каталог внутри контейнера не должен использоваться как постоянное
хранилище документов.

Важно: `npm error signal SIGTERM` во время переключения версии часто является нормальным завершением старого процесса при перезапуске старого Node-развертывания.

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
