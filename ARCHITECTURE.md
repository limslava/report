# Архитектура системы управления логистикой

## Общая схема

```
┌──────────────────────────────────────────────────────────────┐
│                     Клиент (браузер)                         │
│  React SPA + MUI + Zustand + Recharts/ECharts                │
│  tus-js-client (фото склада) · WebSocket (непрочитанное)     │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS (REST API + WebSocket)
┌────────────────────────────▼─────────────────────────────────┐
│                 Backend (Node.js + Express)                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Роутеры: auth, planning-v2, financial-plan, admin,     │  │
│  │ users, email, smtp-config, notes, operations-preview,  │  │
│  │ fuel, directories, contracts, counterparties,          │  │
│  │ carriers, candidate-checks, warehouse, hh              │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Сервисы: расчеты отчетов, Excel/PDF, email-планировщик,│  │
│  │ WebSocket, tus-загрузки, предпросмотры (LibreOffice,   │  │
│  │ heic-convert), интеграция hh.ru                        │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Модели TypeORM (PostgreSQL, ~60 таблиц) + Redis (Bull) │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │
     ┌──────────────┬────────┴───────┬────────────────────┐
     │              │                │                    │
┌────▼─────┐ ┌──────▼──────┐ ┌───────▼───────┐ ┌──────────▼───────┐
│PostgreSQL│ │    Redis    │ │ SMTP-сервер   │ │ Внешние сервисы  │
│          │ │(кеш,очереди)│ │ (рассылки)    │ │ hh.ru API,       │
│          │ │             │ │               │ │ LibreOffice(CLI) │
└──────────┘ └─────────────┘ └───────────────┘ └──────────────────┘
```

## Компоненты backend

### 1. Маршрутизация (Express Router)

| Роутер | Модуль |
|--------|--------|
| `auth.routes` | вход, восстановление пароля, регистрация (закрыта, `INVITE_ONLY`) |
| `planning-v2.routes` | сегменты, значения, отчеты, экспорты, tech-dashboard |
| `financial-plan.routes` | финплан и ставки НДС |
| `operations-preview.routes` | графики работы: JSONB-состояние по скоупам, Excel, отчеты, эффективность |
| `fuel.routes` | топливо: строки месяца, состав, сезоны, экспорт месяц/год |
| `directories.routes` | справочники водителей/техники/прицепов/моделей, карточка водителя |
| `contracts.routes` | договоры: согласование, обсуждения, вложения, SLA, печатный пакет, производственный календарь |
| `counterparties.routes`, `carriers.routes` | справочники контрагентов и перевозчиков |
| `candidate-checks.routes` | проверка кандидатов СБ (заявки, вложения, предпросмотр) |
| `warehouse.routes` | склад: приемка/выдача, осмотры, фото (tus), клиенты, услуги, тарифы, биллинг |
| `hh.routes` | HR: заявки на подбор, вакансии, кандидаты, интеграция hh.ru, вебхуки |
| `notes.routes` | календарь и заметки |
| `email.routes`, `smtp-config.routes` | рассылки и SMTP |
| `admin.routes`, `users.routes` | пользователи, аудит, статистика, app-settings |
| health endpoints | `/health/*` (db/redis/scheduler) |

### 2. Контроллеры
Контроллеры обрабатывают HTTP-запросы и делегируют бизнес-логику сервисам
(по одному-четыре контроллера на модуль, см. `backend/src/controllers/`).
Крупные: `operations-preview.controller` (графики), `fuel.controller`,
`directories.controller`, `contracts.controller`, `warehouse*.controller`
(4 контроллера), `hh-*.controller` (заявки, рекрутинг, настройки, вебхуки).

### 3. Сервисы (ключевые)
- **planning-v2-report / planning-v2-totals** – расчеты дашбордов, отчетов,
  итогов и плана с переносом (источник истины по формулам).
- **excel-export** сервисы модулей – единый стиль выгрузок (шапки, цвета,
  легенды, закрепление областей).
- **employee-card.service** – фиксированный текстовый шаблон карточки
  водителя (со сцепкой из графика или без нее).
- **docx-pdf-preview.service** – конвертация DOCX → PDF через LibreOffice
  (кеш рядом с файлом); **heic-preview.service** – HEIC → JPEG
  (heic-convert, детект по сигнатуре `ftyp`).
- **websocket.service** – push-обновления счетчиков непрочитанного
  (заметки, обсуждения договоров).
- **email-scheduler** – расписания рассылок (Bull/Redis, типы `sv_pdf`,
  `planning_v2_segment`, `monthly_final`).
- **hh-*.services** – OAuth hh.ru, синхронизация вакансий/откликов,
  rate-limit, шифрование токенов, вебхуки.
- **tus** (`@tus/server`) – докачиваемая загрузка фото склада, фоновая
  очистка временных файлов.

### 4. Модели данных (TypeORM, по модулям)
- **Система:** User (28 ролей), AuditLog, AppSetting, PlanHistory,
  EmailSchedule, SmtpConfig, CalendarWorkday
- **Planning v2:** PlanningSegment, PlanningMetric, PlanningDailyValue,
  PlanningMonthlyPlan, PlanningMonthlyPlanMetric
- **Финплан:** FinancialPlanValue, FinancialVatRate
- **Графики:** OperationsPreviewState — JSONB-состояние на скоуп
  (`ktk_vvo_preview_v1`, `ktk_mow_preview_v1`, `garage_preview_v1`,
  `garage_mow_preview_v1`, `security_preview_v1`): составы месяцев
  (`peopleByMonth`), план/факт (`overrides`), направления автовозов
- **Топливо/справочники:** FuelEntry (uniq `vehicleId+month`), FleetVehicle,
  Trailer, VehicleModel (нормы зима/лето), Employee (ПДн)
- **Договоры:** Contract, ContractApprovalStep,
  ContractApprovalDecisionEvent, ContractAttachment,
  ContractDiscussion{Message,Attachment,Read}, ContractSlaRule,
  ContractTemplateVersion, ContractWorkSchedule, Counterparty
- **Проверка кандидатов:** CandidateCheck, CandidateCheckAttachment
- **Склад:** WarehouseClient, WarehouseVehicle, WarehouseVehicleInspection,
  WarehousePhoto, WarehousePendingPhotoUpload, WarehouseOperation,
  WarehouseServiceDefinition, WarehousePerformedService, WarehouseTariff,
  WarehouseBillingPeriod, WarehouseStorageRequest
- **HR/hh.ru:** HhHiringRequest, HhVacancy, HhCandidate, HhCandidateEvent,
  HhCandidateSubmission, HhConnection, HhDictionary, HhSyncRun,
  HhWebhookEvent, HhOauthState
- **Календарь:** Note, NoteRecipient, NoteRead

### 5. Middleware
- **authenticate** – проверка JWT-токена
- **authorize / authorizeRole** – ролевая модель; матрицы доступа модулей
  вынесены в `backend/src/constants/` (например, `directories.ts`:
  `FUEL_ROLES`, `DIRECTORY_ROLES`, разрезы по регионам)
- **express-validator** – валидация входящих данных
- **error-handler** – централизованная обработка ошибок (redaction
  чувствительных полей в логах)
- **logger** – структурированное логирование (Winston)

## Ролевая модель (принципы)

- Роль — единственный источник прав; поля `department` нет.
- Регион (Владивосток/Москва) выводится из роли: `*_vvo` / `*_mow`;
  админ и отдел кадров видят оба региона.
- ПДн водителей (паспорт, адрес, ВУ) доступны ролям справочников; роли БДД
  работают с топливом без доступа к ПДн. Копирование карточки — аудируемое
  действие.
- Политика «только из справочника»: после даты
  `schedule_free_input_until` (app_settings) новые ФИО/госномера в графиках
  КТК принимаются только из справочников (существующие строки и перенос
  месяца не затрагиваются; гараж и СБ — всегда свободный ввод).

## Паспорт формул (Planning v2)

Ниже зафиксированы ключевые формулы, которые используются в backend и должны совпадать с Excel-логикой.

### 1) Базовые обозначения
- `daysInMonth` — количество дней в месяце.
- `completedDays` — завершенные дни: `day(asOfDate) - 1`.
- `planMonth` — месячный план (используется `carryPlan`, если задан; иначе `basePlan`).
- `planToDate` — план на дату:
  - прошлые месяцы: `planToDate = planMonth`
  - будущие месяцы: `planToDate = 0`
  - текущий месяц: `(planMonth / daysInMonth) * completedDays`.
- Инициализация справочников (`/v2/planning/bootstrap`) добавляет отсутствующие метрики.
  Существующие значения `basePlan/carryPlan` не перезаписываются.
- `factToDate` — сумма факта за дни `1..completedDays`.
- `monthFact` — сумма факта за весь месяц.

### 2) KTK (Владивосток/Москва)
- `Итого в день (план)` = `Выгрузка/погрузка (план)` + `Перемещение (план)`.
- `Итого в день (факт)` = `Выгрузка/погрузка (факт)` + `Перемещение (факт)`.
- `% на дату` = `factToDate / planToDate`.
- `% по месяцу` = `monthFact / planMonth`.
- `Среднее в день` = `factToDate / completedDays`.
- `Ср. вал сутки` = `grossToDate / completedDays`.
- `Ср. стоимость заявки` = `grossToDate / factToDate`.
- `ТС на линии (Факт)` — с мая 2026 не вводится вручную: берется дневное
  `Итого` из графика работы «Контейнеровозы → Факт» соответствующего региона.

### 3) AUTO (Отправка авто)
- `waiting[d] = waiting[d-1] + received[d] - sent[d]`.
- `waiting[1] = waitingStart + received[1] - sent[1]`.
- `Итого принято` = сумма принятых по `Автовоз/КТК/Штора`.
- `Итого отправлено` = сумма отправленных по `Автовоз/КТК/Штора`.
- `Итого в ожидании` = сумма `waiting` по `Автовоз/КТК/Штора`.
- `Δ ДЗ/КЗ` = `ДЗ (не оплаченная)` + `ДЗ (оплачено на карты)` − `Задолженность перегруз` − `Задолженность кэшбек` − `Подрядчики Владивосток`.

### 4) RAIL
- `Из Владивостока (итого)` = `20` + `40`.
- `Во Владивосток (итого)` = `20` + `40`.
- `ЖД (итого)` = `Из Владивостока (итого)` + `Во Владивосток (итого)`.
- `Принято всего` = ввод по дням (сумма за месяц).
- `В ожидании отгрузки всего`:
  - `waiting[d] = waiting[d-1] + received[d] - sent[d]`,
  - `waiting[1] = waitingStart + received[1] - sent[1]`,
  - `sent[d] = ЖД (итого)[d]`, `received[d] = Принято всего[d]`.

### 5) EXTRA
- `Итог` = `Сборный груз` + `Шторы (тенты)` + `Экспедирование` + `Перетарка/доукрепление`.

### 6) План с переносом (Операционный отчет v2)
- Январь: `carry(1) = base(1)`.
- Для месяца `m > 1`:
  - `carry(m) = base(m) + max(0, carry(m-1) - fact(m-1))`.
- `% выполнения` = `fact / carry`.

### 7) Источник истины
- Все формулы считаются в backend (`planning-v2-report.service.ts`, `planning-v2-totals.service.ts`).
- Frontend только отображает данные и отправляет вводимые значения.

## Формулы модуля «Топливо»

- `Пробег` = `одометр(месяц)` − `одометр(прошлый месяц)`; в первый месяц ТС —
  ручной ввод.
- `Начальный уровень` = `конечный уровень прошлого месяца`; в первый месяц —
  ручной ввод. Оба поля можно переопределить вручную (с маркером).
- `Расход` = `начальный уровень` + `заправлено` − `конечный уровень`.
- `л/100км` = `расход / пробег × 100`; сравнивается с нормой модели по сезону
  (зима: 1.11–31.03, лето: 1.04–31.10; границы настраиваются в
  `app_settings.fuel_seasons`).

## Компоненты frontend

### 1. Структура приложения (React)
- **App.tsx** – корневой компонент с роутингом (lazy-загрузка страниц)
- **layouts/DashboardLayout** – макет с боковым меню по ролям, шапкой и
  глобальным диалогом несохраненных изменений (unsavedChanges store:
  страницы регистрируют обработчики save/discard)
- **pages/** – основные страницы:
  - `PlansPage`, `SummaryReportPage`, `SWTechDashboardPage` – отчетность
  - `OperationsPreview`, `OperationsScheduleReportsPage`,
    `AutoTripDirectionsReportPage` – графики работы и отчеты по ним
  - `FuelPage`, `DirectoriesPage` – топливо и справочники
  - `ContractApprovalPage`, `BPApprovalDashboardPage` – согласование договоров
  - `CandidateChecksPage` – проверка кандидатов
  - `WarehousePage`, `WarehouseReceptionPage`, `WarehouseIssuePage`,
    `WarehouseOperationsPage`, `WarehouseOnSitePage` – склад
  - `HrDashboardPage`, `HrRequestsPage`, `HrVacanciesPage`,
    `HrCandidatesPage`, `HrInterviewsPage`, `HrReportsPage` – HR-модуль
  - `CalendarPage` – календарь/заметки
  - `AdminPage`, `SettingsPage`, `LoginPage`, `ResetPasswordPage`

### 2. Управление состоянием (Zustand)
- **auth-store** – токен, данные пользователя, login/logout
- **unsavedChanges store** – глобальный флаг + обработчики save/discard
- **unread store** – счетчики непрочитанного (WebSocket + fallback-опрос)
- **ui-store** – состояние UI (уведомления, загрузки)

### 3. Доступ по ролям
- `utils/rolePermissions.ts` – зеркальная к backend матрица: пункты меню,
  скоупы графиков, регионы топлива/справочников, доступ к дашбордам.

### 4. Характерные компоненты
- **ExcelLikePlanTable** и матрицы графиков/топлива – Excel-подобный ввод
  (выделение диапазонов, копирование/вставка, контекстные меню, липкие
  колонки, ввод статусов с клавиатуры)
- **PlanDashboard**, **YearTotalsV2Table** – отчетные представления
- Диалоги договоров/предпросмотров (`components/contracts/`) – просмотр
  вложений (изображения, PDF, DOCX→PDF, HEIC→JPEG)

## База данных

### PostgreSQL
- Логическая схема соответствует моделям TypeORM; в разработке —
  `synchronize`, на проде — управляемые изменения (`DB_SYNCHRONIZE=false`).
- Прод: managed PostgreSQL 17 (Amvera). Индексы на ключевых полях выборок
  (сегмент, дата, метрика; уникальность `fuel_entries(vehicle, month)`,
  `fleet_vehicles(plate)`).
- Состояние графиков хранится как JSONB на скоуп (см. модель
  OperationsPreviewState) — версионируемые ключи `*_preview_v1`.

### Redis
- Кеширование тяжелых отчетов (например, tech-dashboard, короткий TTL).
- Очереди задач (Bull) для планировщика email.
- Опционален (`REDIS_ENABLED=false` отключает очередь; рассылки — в
  прямом режиме).

## Взаимодействие с внешними системами

- **SMTP** – приглашения, рассылка отчетов (Nodemailer, TLS).
- **hh.ru API** – OAuth-подключение работодателя, синхронизация
  вакансий/откликов, вебхуки; токены шифруются `HH_CRYPTO_KEY`,
  ПДн кандидатов удаляются по истечении `HH_PII_RETENTION_DAYS`.
- **LibreOffice (CLI)** – конвертация DOCX в PDF для предпросмотров.
- **Файлы** – `uploads/` (вложения, фото склада с tus-докачкой и
  резервной копией; кеш предпросмотров рядом с файлом).

## Безопасность

- **Аутентификация** – JWT (`JWT_EXPIRES_IN`).
- **Авторизация** – ролевая модель (28 ролей), регион и модуль выводятся из
  роли; отдельные матрицы доступа на модуль.
- **ПДн** – доступ к персональным данным водителей и кандидатов ограничен
  ролями; операции копирования карточек аудируются; ретеншн ПДн hh.ru.
- **Регистрация** – закрыта (`INVITE_ONLY=true`); лимит входа 10 попыток /
  5 минут; временные пароли — `crypto.randomBytes`.
- **Валидация** – express-validator на всех входах; TypeORM —
  параметризованные запросы.
- **Логи** – чувствительные поля редактируются перед записью.
- **HTTPS** – обязателен в продакшене; `TRUST_PROXY` для работы за
  reverse-proxy.

## Резервное копирование и восстановление

1. Ежедневный бэкап БД через `pg_dump` (managed-БД Amvera доступна извне
   через TLS-туннель — см. `docs/LOCAL_RUN.md`).
2. Резервное копирование `uploads/` (вложения, фото склада).
3. Хранение бэкапов вне платформы.
4. Локальная копия продовой БД для проверки миграций — `docs/LOCAL_RUN.md`.

---

*Документ актуален на август 2026 года.*
