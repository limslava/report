import Joi from 'joi';

// Схема валидации для оперативных данных
export const operationalDataSchema = Joi.array().items(
  Joi.object({
    category: Joi.string().required().max(100),
    value: Joi.number().required().min(0),
    isPlan: Joi.boolean().required(),
  })
);

// Схема валидации для месячных данных
export const monthlyDataSchema = Joi.object({
  basePlan: Joi.number().optional().min(0),
  actual: Joi.number().optional().min(0),
  carryOver: Joi.number().optional(),
  adjustedPlan: Joi.number().optional().min(0),
}).unknown(true); // Разрешаем дополнительные поля

// Схема валидации для массового сохранения
export const bulkMonthlyDataSchema = Joi.array().items(
  Joi.object({
    month: Joi.number().required().min(1).max(12),
    data: monthlyDataSchema.required(),
  })
);

// Схема валидации для метрик
export const metricsSchema = Joi.array().items(
  Joi.object({
    metricType: Joi.string().required().max(50),
    value: Joi.number().required(),
    isCalculated: Joi.boolean().optional().default(false),
    formula: Joi.string().optional().allow(null),
  })
);

// Схема валидации для начальных остатков
export const balanceSchema = Joi.object({
  department: Joi.string().required().valid(
    'container_vladivostok',
    'container_moscow',
    'railway',
    'autotruck',
    'additional'
  ),
  balanceDate: Joi.date().required(),
  category: Joi.string().required().max(50),
  balanceValue: Joi.number().required(),
  notes: Joi.string().optional().allow('', null),
});

// Схема валидации для ручных записей
export const manualEntrySchema = Joi.object({
  entryType: Joi.string().required().max(50),
  value: Joi.number().required(),
  currency: Joi.string().optional().default('RUB').max(3),
  description: Joi.string().optional().allow('', null),
});

// Схема валидации для копирования данных
export const copyDataSchema = Joi.object({
  fromMonth: Joi.number().required().min(1).max(12),
  toMonth: Joi.number().required().min(1).max(12),
});

// Схема валидации для email конфигурации
export const smtpConfigSchema = Joi.object({
  host: Joi.string().required().hostname(),
  port: Joi.number().required().min(1).max(65535),
  secure: Joi.boolean().optional().default(false),
  user: Joi.string().required().email(),
  password: Joi.string().required().min(1),
  from: Joi.string().required().email(),
});

// Схема валидации для email расписания
export const emailScheduleSchema = Joi.object({
  name: Joi.string().required().min(1).max(100),
  recipients: Joi.array().items(Joi.string().email()).min(1).required(),
  reportType: Joi.string().required().valid('daily', 'weekly', 'monthly'),
  department: Joi.string().optional().valid(
    'container_vladivostok',
    'container_moscow',
    'railway',
    'autotruck',
    'additional'
  ),
  schedule: Joi.string().required(), // Cron expression
  enabled: Joi.boolean().optional().default(true),
});

// Схема валидации для регистрации пользователя
export const registerSchema = Joi.object({
  email: Joi.string().required().email(),
  password: Joi.string().required().min(6),
  fullName: Joi.string().required().min(2).max(100),
  role: Joi.string().required().valid(
    'admin',
    'director',
    'financer',
    'sales',
    'container_vladivostok',
    'container_moscow',
    'railway',
    'autotruck',
    'additional'
  ),
});

// Схема валидации для входа
export const loginSchema = Joi.object({
  email: Joi.string().required().email(),
  password: Joi.string().required(),
});

// Схема валидации для смены пароля
export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().required().min(6),
});

// Схема валидации для восстановления пароля
export const forgotPasswordSchema = Joi.object({
  email: Joi.string().required().email(),
});

// Схема валидации для сброса пароля
export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().required().min(6),
});
