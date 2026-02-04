-- Создание администратора по умолчанию
INSERT INTO users (id, email, password_hash, full_name, role, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@example.com',
  '$2a$12$mSSWGMNlZQ1uUFO4PJ28puM8p6JTFVEdgHciYCDBELygfd3SSRJg6', -- хэш пароля "admin123"
  'Администратор системы',
  'admin',
  NOW()
) ON CONFLICT (email) DO NOTHING;