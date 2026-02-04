-- Миграция для объединения полей department и role
-- Преобразует существующих операторов в роли-направления, менеджеров в директоров
-- Удаляет столбец department

BEGIN;

-- Увеличиваем длину role до 50 символов (чтобы вместить container_vladivostok и другие)
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50);

-- 1. Обновляем роль операторов (направление становится ролью)
UPDATE users 
SET role = department 
WHERE role = 'operator' 
  AND department IN ('container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional');

-- 2. Менеджеры становятся директорами (если есть)
UPDATE users 
SET role = 'director' 
WHERE role = 'manager';

-- 3. Для администраторов оставляем роль 'admin' (department = 'admin' уже)
-- Ничего не делаем

-- 4. Удаляем столбец department (предварительно убедиться, что данные перенесены)
ALTER TABLE users DROP COLUMN department;

COMMIT;