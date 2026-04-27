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
2. Запускает `amvera:build` (из `package.json`).
3. Собирает архив и загружает артефакт.
4. Перезапускает приложение (`amvera:start`).

Важно: `npm error signal SIGTERM` во время переключения версии часто является нормальным завершением старого процесса при перезапуске.

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

## 4. Релиз в production (main)

После успешной проверки на stage:

```bash
git checkout main
git pull origin main
git merge --no-ff develop
git push origin main
```

После `git push origin main` Amvera production выполнит автосборку и автодеплой.

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

Прямой push в remote `amvera` использовать только осознанно, как ручной спец-сценарий.
