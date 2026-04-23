# Changelog

## Unreleased
- Work schedule (Operations Preview)
  - Reworked KTK Vladivostok left menu into "График работы" with nested sections:
    `Контейнеровозы`, `Автовозы`, `Диспетчера`, `Курьеры (Оперативники)`.
  - Added role-aware access/scoping for KTK VVO manager/head/admin in work schedule screens.
  - Implemented `План/Факт` mode for `Контейнеровозы` with controlled copy `План -> Факт`.
  - Added confirmation flow when copying plan to fact with manual fact edits present.
  - Added monthly persistence model for people and overrides with carry-over of roster
    to next month and empty schedule cells by default.
  - Added/updated sections for `Автовозы`, `Диспетчера`, `Курьеры` in fact mode.
  - Unified save/unsaved-change behavior; prevented false dirty state on simple cell select.
  - Added sorting in work tables:
    - Containers/Auto: by `ФИО` and `Г/Н ТС`
    - Dispatchers/Couriers: by `ФИО`
    - sort preference persisted in localStorage per user/browser.
  - Updated totals rules:
    - `Контейнеровозы`: per-day total counts car once if any driver lane has `1` or `П`.
    - `Автовозы`: same per-day counting rule as containers.
  - Simplified add-row modal and removed cell double-click modal editor.
  - Keyboard status input in schedule now accepts Russian layout mappings only.
  - Added Excel export endpoint for work schedule sections and improved exported visual style
    (headers, borders, colors, legend, totals, frozen panes).
  - Added `Эффективность` section in work schedule with yearly calculations for:
    - `Контейнеровозы`
    - `Автовозы`
  - `Эффективность` is calculated from `Факт` data in work schedule.
  - Updated efficiency Excel export:
    - file name includes site: `График эффективности - КТК Владивосток.xlsx`
    - improved visual formatting and highlighted key KPI rows.
  - Since **May 2026**, metric `ТС на линии (Факт)` in daily KTK VVO report is
    auto-filled from `График работы -> Контейнеровозы -> Факт` (daily `Итого`)
    and is no longer editable manually.
  - Calendar unread counter now updates without page reload:
    - WebSocket event `notes:unread-refresh`
    - global unread store (Zustand)
    - fallback polling + focus/visibility refresh for reliability.

- Roles & auth
  - Closed open registration with `INVITE_ONLY=true` gate.
  - Added admin-only email schedule access.
  - Validated role on admin user update.
  - Switched temporary password generation to `crypto.randomBytes`.
  - Synced frontend role list with backend (including `to_auto`).
- DB & schema
  - `users.role` widened to `VARCHAR(50)` and `is_active` added in SQL init.
  - Added prod migrations: drop legacy `users.department`, add `is_active`, widen role.
  - Fixed docker-compose init mount to use root `database/init`.
- Health & reliability
  - Added DB/Redis/Scheduler health endpoints + metrics (doc updates).
  - Added DB circuit breaker metrics and retries (doc updates).
- UI
  - Settings tabs updated: "Почта" separate from "Уведомления".
  - Financial plan header alignment tweaks.
- Excel exports: removed "Факт за месяц" from dashboard block.
- AUTO: added debt fields (unpaid / paid to cards) and hide debt rows for `manager_sales` in UI/Excel.
- KTK dashboard: added `Ср. стоимость заявки` (gross / factToDate).
- AUTO dashboard: `Δ ДЗ/КЗ` uses debt totals formula in dashboard/Excel.
- Reports & scheduler
  - Added `monthly_final` schedule type (СВ за месяц, итоговый).
  - Plan-to-date for past months equals month plan; future months show zero.
- Финансовый план
  - «Цена с НДС, руб/шт» теперь считает итог за год как среднее арифметическое по месяцам.
- Security & ops
  - Redact sensitive fields in error logs.
  - Added `TRUST_PROXY` support.
  - JWT TTL now uses `JWT_EXPIRES_IN`.
  - `VITE_API_URL` supported in frontend API client.
  - Added `.xlsx/.xls` to `.gitignore`.
- Tests
  - Added admin role validation test.
  - Added invite-only register test.
  - Expanded planning-v2 test coverage.
- Docs
  - Updated README, ARCHITECTURE, ROADMAP, PRODUCTION_CHECKLIST, AMVERA_DEPLOY.
