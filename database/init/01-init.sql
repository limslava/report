-- Создание таблиц для системы управления логистикой и отчетности

-- Требуется для gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Пользователи
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN (
    'admin', 'director', 'financer', 'manager_sales',
    'manager_ktk_vvo', 'manager_ktk_mow', 'manager_auto', 'manager_rail', 'manager_extra', 'manager_to'
  )),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Оперативные данные
CREATE TABLE IF NOT EXISTS operational_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL CHECK (department IN ('container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional')),
  record_date DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  is_plan BOOLEAN NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(department, record_date, category, is_plan)
);

-- 3. Планы (итоговые)
CREATE TABLE IF NOT EXISTS monthly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL CHECK (department IN ('container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional')),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  base_plan DECIMAL(10,2),
  actual DECIMAL(10,2),
  adjusted_plan DECIMAL(10,2),
  completion_percentage DECIMAL(5,2),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(department, year, month)
);

-- 4. Отчеты
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('daily', 'monthly', 'summary')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  department VARCHAR(50),
  file_path VARCHAR(500) NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- 4.1 Аудит логов
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id VARCHAR(100) NULL,
  details JSONB NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Email рассылка
CREATE TABLE IF NOT EXISTS email_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  schedule JSONB NOT NULL,
  recipients JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_sent TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Таблица для метрик направлений (дополнение)
CREATE TABLE IF NOT EXISTS department_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL CHECK (department IN ('container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional')),
  metric_date DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value DECIMAL(15,2),
  is_calculated BOOLEAN DEFAULT false,
  formula TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(department, metric_date, metric_type)
);

-- 7. Таблица для начальных остатков
CREATE TABLE IF NOT EXISTS initial_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL CHECK (department IN ('autotruck')),
  balance_date DATE NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('Автовоз', 'КТК', 'Штора')),
  balance_value DECIMAL(10,2) NOT NULL,
  notes TEXT,
  entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  entered_at TIMESTAMP DEFAULT NOW()
);

-- 8. Таблица для ручного ввода
CREATE TABLE IF NOT EXISTS manual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL CHECK (department IN ('container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional')),
  entry_date DATE NOT NULL,
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('val_total', 'overload_debt', 'cashback_debt')),
  value DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'RUB',
  description TEXT,
  entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  entered_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(department, entry_date, entry_type)
);

-- Индексы для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_operational_data_department_date ON operational_data(department, record_date);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_department_year_month ON monthly_plans(department, year, month);
CREATE INDEX IF NOT EXISTS idx_department_metrics_department_date ON department_metrics(department, metric_date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- Комментарии
COMMENT ON TABLE users IS 'Пользователи системы с ролями';
COMMENT ON TABLE operational_data IS 'Ежедневные оперативные данные по направлениям';
COMMENT ON TABLE monthly_plans IS 'Месячные планы и факты по направлениям';
COMMENT ON TABLE reports IS 'Сгенерированные отчеты';
COMMENT ON TABLE email_schedules IS 'Расписания email-рассылок';
COMMENT ON TABLE department_metrics IS 'Расчетные метрики по направлениям';
COMMENT ON TABLE initial_balances IS 'Начальные остатки для автовозов';
COMMENT ON TABLE manual_entries IS 'Ручной ввод финансовых показателей';
