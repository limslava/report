# Changelog

## Unreleased
- SW Tech Dashboard
  - Added year/month period selectors in the top bar and period-aware data loading.
  - Updated monthly logic for widgets/charts:
    - current month uses factual date (today - 1),
    - past months use month totals,
    - future months keep plan-only behavior where applicable.
  - Improved chart behavior:
    - month labels are always visible,
    - `% completion` line is hidden for future months.
  - Reworked `Ключевые риски` calculation:
    - current calendar month: plan-to-date vs fact-to-date,
    - past months: month plan vs month fact.
  - Fixed past-month risk status: under-plan fact is now shown as risk.
  - Renamed risk row `Автовозы` to `Автовозы и шторы` for consistency with KPI cards.
  - Added backend cache for `/v2/planning/reports/tech-dashboard` (short TTL) and frontend debounce/lazy chart init for faster loading.

- Work schedule (Operations Preview)
  - Added new schedule roles and access scopes:
    `Руководитель отдела кадров`, `Специалист отдела кадров`,
    `Начальник гаража Владивосток`, `Руководитель КТК Москва`.
  - Added separate work schedule scopes for Vladivostok and Moscow.
  - Reworked admin/HR schedule menu into location-first hierarchy:
    `Владивосток -> Диспетчерский отдел/Гараж` and
    `Москва -> Диспетчерский отдел`.
  - Added garage mechanic schedule section (`Автослесарь`) and sick leave status
    `Б — больничный` for personnel schedules.
  - Added HR/admin schedule report builder with location-dependent filters and
    multi-sheet Excel export.
  - Unified report Excel sheets with regular schedule exports: headers, colors,
    totals, legends, frozen panes, readable sheet names, and soft sheet tab colors.
  - Fixed multi-sheet report downloads on macOS/Finder: report files now keep the
    expected `ГР_<город>_<месяц>_<год>.xlsx` name when saved.
  - Added fallback normalization for schedule cell codes in Excel exports, so
    unexpected legacy values no longer break report generation.
  - HR roles now have read-only access to work schedule facts and can edit only
    allowed plan layers (`Контейнеровозы`, `Автослесарь`).
  - Added `План/Факт` mode for `Автослесарь` for admin and HR roles; garage head
    keeps fact-only access.
  - Added auto schedule status `С — снятие груза`; it is counted as one shift in
    totals and efficiency calculations.
  - Updated work schedule menu order: `Контейнеровозы` before `Автовозы`.
  - Added work schedule audit action `WORK_SCHEDULE_SAVED`.
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
  - Work schedule Excel export now merges `Г/Н ТС` cells for two-driver vehicles.
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
  - Improved row drag-and-drop reliability (including edge cases for top/bottom reorder).
  - Increased drag handle hit area for easier pointer interaction.
  - Added spreadsheet-like cell range selection and copy/paste:
    - mouse/keyboard selection,
    - `Ctrl/Cmd + C` and `Ctrl/Cmd + V` for selected ranges,
    - `Shift + Arrow` range expansion.

- Roles & auth
  - Added role `head_sales` (Руководитель отдела продаж).
  - `head_sales` now has the same planning/report permissions profile as `manager_sales`.
  - SW Tech Dashboard access expanded to `director`, `financer`, and `head_sales` (in addition to `admin`).
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
