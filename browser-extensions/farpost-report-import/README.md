# Report FarPost Import

MVP Chrome-расширения для импорта открытого резюме FarPost в HR-модуль Report.

## Установка локально

1. Откройте `chrome://extensions`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked`.
4. Выберите папку `browser-extensions/farpost-report-import`.
5. Нажмите иконку расширения, проверьте адрес API `http://localhost:3101/api`, войдите под пользователем Report.
6. Откройте страницу резюме FarPost и нажмите кнопку `Сохранить в Report`.

## Как работает

- content script добавляет кнопку на страницы FarPost;
- background service worker отправляет текст страницы и URL в `POST /api/hh/import/farpost/resume`;
- backend Report распознаёт резюме, создаёт кандидата и пишет событие импорта.

## Безопасность токена

С 30.07.2026 расширение НЕ хранит полный JWT пользователя. При входе оно сразу
обменивает его на **import-token** (scope `farpost_import`, срок жизни 30 дней,
настраивается `HH_IMPORT_TOKEN_TTL_DAYS`), который открывает только
`POST /api/hh/import/farpost/resume`. На всех остальных эндпоинтах Report такой
токен отклоняется. Отзыв: деактивация пользователя в админке отзывает и его
import-токены; по истечении срока нужно войти в popup заново.

## Ограничения MVP

- кандидат импортируется без выбора вакансии;
- парсер берёт текст страницы целиком;
- для production нужен короткоживущий import-token или отдельная авторизация расширения.
