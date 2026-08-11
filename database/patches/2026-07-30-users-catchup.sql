-- Приведение таблицы users к текущей модели кода.
--
-- Зачем: база создана скриптом database/init/01-init.sql и с тех пор к сущностям
-- не приводилась. Код ожидает колонки timezone, workday_start, workday_end,
-- workdays, warehouse_client_id, а в CHECK-ограничении роли отсутствует
-- hr_recruiter — без него рекрутера нельзя даже создать.
--
-- Идемпотентно, ничего не удаляет и не переносит данные.
--
-- Применение:
--   PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d logistics_reporting -f database/patches/2026-07-30-users-catchup.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'users') THEN
    RAISE EXCEPTION 'Нет таблицы users — это не база Report. Проверьте имя БД.';
  END IF;
END $$;

-- 1. Недостающие колонки (модель User в backend/src/models/user.model.ts).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" character varying(64);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workday_start" character varying(5);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workday_end" character varying(5);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workdays" character varying(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "warehouse_client_id" uuid;

-- 2. Связь со складским клиентом — только если таблица склада существует.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'warehouse_clients')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname = 'fk_users_warehouse_client') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "fk_users_warehouse_client"
      FOREIGN KEY ("warehouse_client_id") REFERENCES "warehouse_clients"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 3. CHECK по роли: в 01-init.sql нет hr_recruiter, а код его использует.
--    Пересобираем ограничение по актуальному списку из
--    backend/src/constants/role-definitions.ts (27 ролей).
DO $$
DECLARE
  bad_roles text;
BEGIN
  -- Сначала убеждаемся, что в данных нет роли вне нового списка.
  SELECT string_agg(DISTINCT role, ', ') INTO bad_roles
  FROM "users"
  WHERE role NOT IN (
    'admin','director','general_director','financer','chief_accountant','lawyer','security','secretary',
    'manager_sales','head_sales','manager_ktk_vvo','head_ktk_vvo','manager_ktk_mow','head_ktk_mow',
    'head_hr','hr_specialist','hr_recruiter','garage_head_vvo','garage_head',
    'manager_auto','manager_rail','manager_extra','manager_to',
    'warehouse_manager_vvo','warehouse_manager','warehouse_keeper','counterparty_user'
  );
  IF bad_roles IS NOT NULL THEN
    RAISE EXCEPTION 'В users есть роли вне актуального списка: %. Разберитесь с ними до применения патча.', bad_roles;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'users'::regclass AND conname = 'users_role_check') THEN
    ALTER TABLE "users" DROP CONSTRAINT "users_role_check";
  END IF;

  ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN (
    'admin','director','general_director','financer','chief_accountant','lawyer','security','secretary',
    'manager_sales','head_sales','manager_ktk_vvo','head_ktk_vvo','manager_ktk_mow','head_ktk_mow',
    'head_hr','hr_specialist','hr_recruiter','garage_head_vvo','garage_head',
    'manager_auto','manager_rail','manager_extra','manager_to',
    'warehouse_manager_vvo','warehouse_manager','warehouse_keeper','counterparty_user'
  ));
END $$;

SELECT 'Готово. users приведена к модели кода. Колонок: ' ||
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'users') ||
       ', hr_recruiter разрешён: ' ||
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%hr_recruiter%' THEN 'да' ELSE 'НЕТ' END
        FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_role_check') AS result;

-- 4. Таблицы, без которых сервер не стартует.
--    ensureDefaultAdmin() читает app_settings, ensureWarehouseServiceCatalog()
--    читает warehouse_service_definitions — оба вызова не обёрнуты в try/catch.
--    IF NOT EXISTS: если таблицы у вас уже есть, ничего не изменится.
CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "key" character varying(120) NOT NULL,
  "value" text NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "pk_app_settings" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_app_settings_key" ON "app_settings" ("key");

CREATE TABLE IF NOT EXISTS "warehouse_service_definitions" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "code" character varying(64) NOT NULL,
  "name" character varying(255) NOT NULL,
  "unit" character varying(20) NOT NULL DEFAULT 'operation',
  "default_quantity" numeric(12,3),
  "is_repeatable" boolean NOT NULL DEFAULT true,
  "is_operational" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "pk_warehouse_service_definitions" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_warehouse_service_definitions_code"
  ON "warehouse_service_definitions" ("code");

SELECT 'Проверка старта: app_settings — ' ||
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema='public' AND table_name='app_settings')
            THEN 'есть' ELSE 'НЕТ' END ||
       ', warehouse_service_definitions — ' ||
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema='public' AND table_name='warehouse_service_definitions')
            THEN 'есть' ELSE 'НЕТ' END AS startup_check;
