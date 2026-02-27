# Система управления логистикой и отчетности

Веб-приложение для оперативного управления логистическими операциями с автоматическим формированием отчетов по пяти направлениям деятельности.

## 📋 Оглавление

- [Назначение системы](#назначение-системы)
- [Функциональные возможности](#функциональные-возможности)
- [Технологический стек](#технологический-стек)
- [Структура проекта](#структура-проекта)
- [Установка и запуск](#установка-и-запуск)
- [Конфигурация](#конфигурация)
- [Использование](#использование)
- [API документация](#api-документация)
- [Надежность](#надежность)
- [Модели данных](#модели-данных)
- [Разработка и тестирование](#разработка-и-тестирование)
- [Развертывание](#развертывание)
- [План развития](#план-развития)
- [Лицензия](#лицензия)

## 🎯 Назначение системы

Система предназначена для ежедневного учета оперативных данных по логистическим направлениям, автоматического расчета плановых показателей, формирования отчетов в форматах PDF/Excel и рассылки результатов заинтересованным лицам по email.

**Основные пользователи:**
- Операторы направлений (5 направлений)
- Руководители направлений
- Топ-менеджмент
- Администраторы системы

**Направления деятельности:**
1. Контейнерные перевозки – Владивосток
2. Контейнерные перевозки – Москва
3. ЖД перевозки
4. Автовозы
5. Дополнительные услуги

## 🚀 Функциональные возможности

### Модуль ввода оперативных данных
- Excel-подобный интерфейс для каждого направления
- Автоматический расчет формул в реальном времени
- Валидация вводимых данных
- История изменений по каждой ячейке
- Автосохранение

### Модуль отчетности
- **Ежедневные отчеты** по направлениям с графиками выполнения плана
- **Операционный отчет (план с переносом)** с автоматическим расчетом плана с переносом
- Визуализация выполнения плана (%)
- Экспорт в Excel с сохранением формул
- В Excel-дашбордах показатель «Факт за месяц» скрыт (в API остается для расчетов)

### Модуль email-рассылки
- Настройка расписания отправки (ежедневно, еженедельно, ежемесячно)
- Шаблоны писем для разных получателей
- Прикрепление отчетов в форматах PDF/Excel
- Лог отправленных писем
- Типы рассылок: СВ (ежедневный), Планирование v2 по сегменту, **СВ за месяц (итоговый)** (`monthly_final`)

### Модуль управления доступом
- Регистрация по приглашению
- Ролевая модель (роль определяет доступ к сегментам/направлениям)
- Роли: admin, director, financer, manager_sales, manager_*
- Восстановление пароля

### Дополнительные метрики
- Расчет плана на дату и выполнения плана в %
- Учет начальных остатков (для автовозов)
- Ручной ввод финансовых показателей (Вал. Общий, задолженности)
- AUTO: ручные задолженности (перегруз, кэшбек, ДЗ неоплаченная, ДЗ на карты)
- Лимит входа: 10 попыток за 5 минут, блокировка на 5 минут после превышения.
- Автоматический перенос остатков между месяцами
- Авто-инициализация справочников planning v2 при старте сервера
- Примечание по безопасности: `xlsx` имеет известные уязвимости без доступного фикса; планируем заменить библиотеку в будущем.

## 🧮 Паспорт формул (кратко)

Подробная версия: `ARCHITECTURE.md` → раздел **Паспорт формул (Planning v2)**.

- `planToDate = (planMonth / daysInMonth) * completedDays`
- Для прошлых месяцев: `planToDate = planMonth`
- Для будущих месяцев: `planToDate = 0`
- KTK: `Итого(план) = выгрузка/погрузка(план) + перемещение(план)`, аналогично для факта.
- AUTO waiting: `waiting[d] = waiting[d-1] + received[d] - sent[d]` (на 1-й день с `waitingStart`).
- RAIL totals: `из ВВО(итого) = 20 + 40`, `во ВВО(итого) = 20 + 40`, `жд(итого) = из + во`.
- RAIL received: `принято всего` — ввод по дням (сумма за месяц).
- RAIL waiting: `waiting[d] = waiting[d-1] + received[d] - sent[d]` (на 1-й день с `waitingStart`), где `sent = жд(итого)`, `received = принято всего`.
- AUTO debts: добавлены `Подрядчики Владивосток (₽)` (тип `currency`, агрегация `LAST`).
- EXTRA total: сумма 4 подсегментов.
- Carry-over (классический):
  - `carry(янв) = base(янв)`
  - `carry(m) = base(m) + debt(m-1)`
  - `debt(m) = max(0, carry(m) - fact(m))`
  - перевыполнение не создает "кредит" на следующий месяц.

## 🛠 Технологический стек

### Backend
- **Язык:** Node.js 18+ с TypeScript
- **Фреймворк:** Express.js
- **База данных:** PostgreSQL 15
- **Кэширование:** Redis 7
- **Очереди задач:** Bull (на основе Redis)
- **Email:** Nodemailer + SendGrid/SMTP
- **ORM:** TypeORM
- **Аутентификация:** JWT

### Frontend
- **Фреймворк:** React 18 с TypeScript
- **UI библиотека:** Material-UI (MUI)
- **State management:** Zustand
- **Таблицы:** MUI X Data Grid + кастомные таблицы
- **Графики:** Recharts
- **Маршрутизация:** React Router 6
- **Формы:** React Hook Form + Yup
- **HTTP клиент:** Axios

### Инфраструктура
- **Контейнеризация:** Docker + Docker Compose
- **Reverse proxy:** Nginx
- **Хостинг:** managed‑платформа (Amvera) или VPS
- **Резервное копирование:** ежедневные бэкапы
- **SSL сертификат:** Let's Encrypt

## 📁 Структура проекта

```
Report/
├── backend/                    # Backend приложение
│   ├── src/
│   │   ├── config/            # Конфигурация (БД, logger)
│   │   ├── controllers/       # Контроллеры API
│   │   ├── middleware/        # Middleware (auth, validation, error)
│   │   ├── models/            # Сущности TypeORM
│   │   ├── routes/            # Маршруты Express
│   │   ├── services/          # Бизнес-логика
│   │   ├── types/             # TypeScript типы
│   │   ├── utils/             # Вспомогательные утилиты
│   │   └── index.ts           # Точка входа
│   ├── scripts/               # Скрипты инициализации
│   ├── tests/                 # Unit- и интеграционные тесты
│   ├── docker-compose.yml     # Конфигурация Docker
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # Frontend приложение
│   ├── src/
│   │   ├── components/        # Переиспользуемые компоненты
│   │   ├── pages/            # Страницы приложения
│   │   ├── layouts/          # Макеты страниц
│   │   ├── services/         # API клиент
│   │   ├── store/            # Zustand хранилища
│   │   ├── styles/           # Глобальные стили
│   │   ├── types/            # TypeScript типы
│   │   ├── utils/            # Вспомогательные функции
│   │   ├── App.tsx           # Корневой компонент
│   │   └── main.tsx          # Точка входа
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── database/                  # SQL скрипты инициализации
│   └── init/
│       ├── 01-init.sql       # Создание таблиц
│       └── 02-seed.sql       # Начальные данные
├── docs/                      # Документация
└── scripts/                   # Вспомогательные скрипты
```

## ⚙️ Установка и запуск

### Предварительные требования
- Node.js 18+ и npm
- Docker и Docker Compose
- Git

### 1. Клонирование репозитория
```bash
git clone <repository-url>
cd Report
```

### 2. Запуск базы данных и Redis
```bash
cd backend
docker-compose up -d
```

Проверьте, что контейнеры запущены:
```bash
docker-compose ps
```

### 3. Настройка переменных окружения
Создайте файл `.env` в папке `backend` на основе `.env.example`:
```bash
cp .env.example .env
```

Отредактируйте `.env` при необходимости (порты, пароли, SMTP).

### 4. Установка зависимостей backend
```bash
cd backend
npm install
```

### 5. Инициализация базы данных
```bash
# Создание таблиц (TypeORM synchronize уже включен)
# При необходимости выполните SQL скрипты вручную:
docker exec -i logistics_postgres psql -U postgres -d logistics_reporting -f /docker-entrypoint-initdb.d/01-init.sql
```

### 6. Запуск backend в режиме разработки
```bash
npm run dev
```

Backend будет доступен по адресу: `http://localhost:3000`

### 7. Установка зависимостей frontend
```bash
cd ../frontend
npm install
```

### 8. Запуск frontend
```bash
npm run dev
```

Frontend будет доступен по адресу: `http://localhost:5173`

### 9. Вход в систему
Откройте `http://localhost:5173` в браузере и войдите под учетной записью администратора.

Рекомендуемый вариант:
- создать/задать админа через переменные окружения backend:
  - `DEFAULT_ADMIN_EMAIL`
  - `DEFAULT_ADMIN_PASSWORD`

## 🔧 Конфигурация

### Backend переменные окружения (.env)
```ini
# База данных
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=logistics_reporting

# JWT
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=noreply@logistics.example.com

# Приложение
APP_PORT=3000
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# Загрузка файлов
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10mb

# Логирование
LOG_LEVEL=info

# Регистрация
INVITE_ONLY=true
```

### Frontend переменные окружения (Vite)
Создайте файл `.env` в папке `frontend`:
```ini
VITE_API_URL=http://localhost:3000/api
VITE_IDLE_TIMEOUT_MIN=60
```
`VITE_API_URL` опционален. Если не задан, фронт использует относительный `/api` (через Vite proxy).

## 📊 Использование

### Панель управления (Dashboard)
После входа открывается главная панель с ключевыми метриками по всем направлениям:
- Выполнение плана за текущий месяц
- Графики динамики показателей
- Уведомления о критических отклонениях

### Работа с направлением
1. Выберите направление в боковом меню.
2. Откроется таблица с оперативными данными (аналогичная Excel).
3. Вводите плановые и фактические значения – система автоматически рассчитает итоги и проценты выполнения.
4. Используйте кнопки «Сохранить», «Экспорт в Excel», «Сформировать отчет».

### Формирование отчетов
- **Ежедневный отчет:** доступен на странице направления после ввода данных.
- **Операционный отчет:** в меню «Показатели» → «Операционный отчет».
- **Сводный отчет:** в меню «Отчетность» → «Сводный отчет».
- Настройте периодичность email‑рассылки отчетов в разделе «Настройки» → «Email рассылка».
- Тип рассылки **«СВ за месяц (итоговый)»** отправляет отчёт за прошлый месяц.

### Валовая прибыль, план
- Для строки «Цена с НДС, руб/шт» в колонке «Итог за год» используется **среднее арифметическое** по месяцам, а не сумма.

### Администрирование
- Раздел «Администрирование» доступен только пользователям с ролью `admin`.
- Возможности: управление пользователями, системная статистика, журнал действий.

### Настройки (admin)
- «Уведомления»: расписания email‑рассылок.
- «Почта»: параметры SMTP.
- «НДС»: управление ставками по годам и периодам.

## 🌐 API документация

### Базовый URL
```
http://localhost:3000/api
```

### Аутентификация
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST  | `/auth/login` | Вход в систему (получение JWT) |
| POST  | `/auth/register` | Регистрация (только по инвайту, `INVITE_ONLY=true`) |
| POST  | `/auth/forgot-password` | Запрос сброса пароля |
| POST  | `/auth/reset-password` | Сброс пароля |

### Planning v2
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/v2/planning/segments` | Список сегментов |
| GET | `/v2/planning/segments/:segmentCode/metrics` | Метрики сегмента |
| GET | `/v2/planning/values?segmentCode&year&month` | Значения за месяц |
| PUT | `/v2/planning/values/batch` | Пакетное сохранение значений |
| GET | `/v2/planning/reports/segment?segmentCode&year&month&asOfDate` | Отчет по сегменту |
| GET | `/v2/planning/reports/summary?year&month&asOfDate` | Сводный отчет |
| GET | `/v2/planning/exports/daily?segmentCode&year&month&asOfDate` | Excel выгрузка по сегменту |
| GET | `/v2/planning/exports/totals?year` | Excel выгрузка итогов по году |
| GET | `/v2/planning/totals/year?year` | Итоги по году |
| PUT | `/v2/planning/totals/base-plan` | Обновление базового плана |
| POST | `/v2/planning/bootstrap` | Инициализация справочников (admin) |

### Финансовый план
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/v2/financial-plan?year` | Отчет по финплану за год |
| PUT | `/v2/financial-plan/values/batch` | Пакетное сохранение значений |
| GET | `/v2/financial-plan/export?year` | Excel выгрузка |
| GET | `/v2/financial-plan/vat-rates?year` | Ставки НДС (admin) |
| POST | `/v2/financial-plan/vat-rates` | Добавить ставку НДС (admin) |

### Email‑рассылки
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/email-schedules` | Список расписаний |
| GET | `/email-schedules/:id` | Детали расписания |
| POST | `/email-schedules` | Создать расписание |
| PUT | `/email-schedules/:id` | Обновить расписание |
| DELETE | `/email-schedules/:id` | Удалить расписание |
| POST | `/email-schedules/:id/test` | Тестовая отправка |

### SMTP (admin)
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/smtp-config` | Получить SMTP настройки |
| POST | `/smtp-config` | Сохранить SMTP настройки |
| POST | `/smtp-config/test` | Проверка SMTP |

### Администрирование (admin)
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/admin/users` | Список пользователей |
| POST | `/admin/users/invite` | Пригласить пользователя |
| PUT | `/admin/users/:id` | Обновить пользователя |
| POST | `/admin/users/:id/reset-password` | Сброс пароля |
| POST | `/admin/users/:id/reassign-delete` | Переназначить и удалить |
| DELETE | `/admin/users/:id` | Удалить пользователя |
| GET | `/admin/audit` | Журнал действий |
| GET | `/admin/stats` | Системная статистика |
| GET | `/admin/app-settings` | Настройки приложения |
| PUT | `/admin/app-settings` | Обновить настройки |

### Health
| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/health` | Проверка процесса |
| GET | `/health/db` | Проверка БД |
| GET | `/health/db/metrics` | Метрики БД |
| GET | `/health/redis` | Проверка Redis |
| GET | `/health/scheduler` | Статус планировщика |

## 🗄 Модели данных

### Основные таблицы PostgreSQL
- **users** – пользователи и роли
- **planning_segments** – сегменты планирования
- **planning_metrics** – справочник метрик
- **planning_daily_values** – дневные значения (Planning v2)
- **planning_monthly_plans** – месячные планы
- **planning_monthly_plan_metrics** – агрегаты по месяцу
- **financial_plan_values** – значения финплана
- **financial_vat_rates** – ставки НДС
- **email_schedules** – расписания email‑рассылок
- **smtp_config** – настройки SMTP
- **app_settings** – настройки приложения
- **plan_history** – история сохранений планов
- **audit_logs** – журнал действий

> Legacy таблицы (если ещё присутствуют в БД): `operational_data`, `monthly_plans`, `reports`, `department_metrics`, `initial_balances`, `manual_entries`.

Подробные схемы таблиц приведены в файлах моделей TypeORM (`backend/src/models/`).

## 🧪 Разработка и тестирование

### Запуск тестов
```bash
cd backend
npm test
```

### Линтинг
```bash
cd backend
npm run lint

cd ../frontend
npm run lint
```

### Миграции базы данных
При изменении моделей создайте новую миграцию:
```bash
cd backend
npx typeorm migration:generate src/migrations/DescriptionOfChange -d src/config/data-source.ts
```

Примените миграции:
```bash
npx typeorm migration:run -d src/config/data-source.ts
```

## 🚢 Развертывание

### Продакшен-сборка
```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
```

### Docker-развертывание
Используйте готовый `docker-compose.prod.yml` (не входит в репозиторий) с настройками Nginx, SSL и мониторингом.

### Резервное копирование
Настройте ежедневный бэкап базы данных через `pg_dump` и хранение на удаленном хранилище.

### Примечание для Amvera
- Для стабильной работы очередей и рассылок необходим доступный Redis.
- Для деплоя используйте `amvera.yml` в корне репозитория.
- Перед релизом используйте чеклист: `backend/PRODUCTION_CHECKLIST.md`.
- Для корректного обновления фронтенда используются cache‑заголовки:
  - `index.html` → `Cache-Control: no-cache`
  - `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`

## 🗺 План развития

- Актуальный roadmap: `DEVELOPMENT_ROADMAP.md`
- Продакшен-чеклист: `backend/PRODUCTION_CHECKLIST.md`

## 📄 Лицензия

Проект распространяется под лицензией MIT. Подробности см. в файле `LICENSE`.

---

## 📞 Контакты и поддержка

По вопросам разработки, доработки и технической поддержки обращайтесь к команде разработки.

**Система успешно развернута и готова к эксплуатации.**
## 🛡️ Надежность

### Health-checks
- `GET /health` — жив ли процесс.
- `GET /health/db` — проверка доступности БД (`SELECT 1`, таймаут 2s, 2 попытки).
- `GET /health/db/metrics` — метрики по доступности БД (latency + ошибки).
- `GET /health/redis` — проверка Redis (для очередей/планировщика).
- `GET /health/scheduler` — статус планировщика email.

### Circuit breaker для БД
Если БД недоступна, API временно возвращает `503`, чтобы не создавать лавину запросов.

Настройки через переменные окружения:
- `DB_CIRCUIT_FAILURE_THRESHOLD` (по умолчанию `5`)
- `DB_CIRCUIT_OPEN_MS` (по умолчанию `30000`)
