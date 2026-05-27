# Changelog

## Unreleased
- Business process / Bill of lading
  - Added `Коносамент` submenu under `Бизнес процесс`.
  - Added Sinokor B/L lookup prototype:
    - backend endpoint `GET /api/carriers/sinokor/bl/:blNo`,
    - frontend test page `/business-processes/bill-of-lading`,
    - parses B/K status, issue status, receipt status, vessel/voyage,
      POL/POD, ETD/ETA, terminals, and container numbers.

- Business process / Contract approval
  - Simplified the Security inbox table: contract files, comments, and visa submission
    moved into a contract card modal, while the table shows the resulting Security visa status.
  - Refined the Security contract card layout and switched card opening to double-click
    on the inbox row.
  - Reworked the Security card approval history into grouped process sections for the
    Security checkpoint and the main parallel approval participants.
  - Added file attachment upload from the Security contract card for extra documents
    such as disagreement protocols.
  - Made the Security contract card more compact and placed approver file actions
    in the approval history with click-to-open attachments.
  - Added approval-step attachments so files from Security, Legal, Accounting, and other
    approvers are visible in the approval history and can be opened by route participants.
  - Added confirmed deletion of approval-step files by their uploader or an administrator.
  - Restricted approval-step file upload to the assigned approver and compacted registry actions.
  - Changed new contract routes to Security review followed by parallel Legal, Chief Accountant,
    and Finance approvals, then a Secretary handoff for physical signing instead of a CEO e-visa.
  - Added a Legal approver workspace: BP dashboard navigation, filtered assigned-contract inbox,
    and a compact decision card matching the Security review workflow without planning metrics.
  - Allowed Security visa decisions and comments to be corrected after submission.
  - Unified Legal and Security decision editors with optional rejection comments and required
    comments only for approval with remarks.
  - Kept parallel Legal, Chief Accountant, and Finance negative visas in the approval history
    without rejecting the full contract; completed parallel reviews now proceed to signature handoff.
  - Compacted registry statuses, clarified parallel approval progress, and added periodic refresh
    for contract registry and approver inboxes.
  - Added draft recovery actions in the contract registry: initiators can resume an
    unfinished draft or delete it with confirmation instead of leaving blocked records.
  - Replaced full-width contract approval alerts with compact snackbar notifications.
  - Allowed attachments for income contracts without a disagreement protocol until automatic
    contract generation is implemented.
  - Localized duplicate-contract statuses and added signed-contract inspection from the
    duplicate warning without losing the current form.
  - Added server-side DOCX-to-PDF preview with original DOCX download retained; deployment now
    uses a LibreOffice-enabled Docker image and persistent `/data/uploads` document storage.
  - Opened signed contracts and signed attachments for review to users admitted to the
    contract-approval module while keeping in-progress contracts restricted.
  - Removed contract-approval calendar tasks for approvers and reduced email noise: new task
    emails go only to their assignee, while a changed submitted visa notifies only affected
    colleagues who have already submitted a decision.
  - Removed deadline, overdue, and escalation email reminders for contract approval; deadlines
    remain visible in dashboards and registries instead of generating mail noise.
  - Highlighted contracts that reached signing but do not yet have a signed copy attached.
  - Made duplicate-contract rows open the approval sheet and added the initiator row with full name
    and launch timestamp to the approval sheet route.
  - Set approval SLA to two scheduled workdays for Security, Legal, Chief Accountant, and
    Finance, followed by one scheduled workday for the Secretary signing handoff.
  - Added the Secretary signing workspace with a printable PDF package assembled in the order:
    approval sheet, approver attachments, and contract documents.
  - Added a compact initiator fallback action for attaching the signed copy when the initiator
    receives the physically signed contract instead of the Secretary.
  - Kept the General Director outside the electronic route while including the default signing
    row in the generated printable approval sheet.
  - Added Sales Manager and Head of Sales as contract initiators with access to their drafts,
    submission workflow, and registry review without granting approver decision rights.

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
  - HR roles now have read-only access to most work schedule facts, can edit
    allowed plan layers (`Контейнеровозы`, `Автослесарь`), and can add/edit
    Vladivostok garage mechanics (`Автослесарь`) in both plan and fact modes.
  - HR roles can now open the row editor for Vladivostok garage mechanics by
    double-clicking or using the name context menu.
  - Added `Заполнить из прошлого месяца` for plan mode in `Контейнеровозы` and
    `Автослесарь`, copying the previous month's roster and plan cells into the selected month.
  - `План -> Факт` copy for plan-enabled schedules now saves automatically after copy
    or replace confirmation.
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
