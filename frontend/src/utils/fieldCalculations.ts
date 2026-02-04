import { FieldDefinition } from './departmentFields';
import { safeCalculate } from './safeCalculator';

/**
 * Вычисляет значение поля на основе формулы и текущих значений.
 * Формула может содержать простые арифметические операции (+,-,*,/) и ссылки на ключи полей.
 * Пример формулы: 'unload_plan + move_plan'
 */
export function calculateField(field: FieldDefinition, values: Record<string, number | null>): number | null {
  if (!field.formula) return null;

  try {
    // Используем безопасный калькулятор вместо eval
    return safeCalculate(field.formula, values);
  } catch (error) {
    console.error(`Ошибка вычисления поля ${field.key}:`, error);
    return null;
  }
}

/**
 * Пересчитывает все вычисляемые поля.
 */
export function recalculateFields(
  fields: FieldDefinition[],
  values: Record<string, number | null>
): Record<string, number | null> {
  const newValues = { ...values };
  
  // Сортируем поля по зависимостям для правильного порядка вычислений
  const sortedFields = topologicalSort(fields);
  
  sortedFields.forEach(field => {
    if (field.isCalculated) {
      newValues[field.key] = calculateField(field, newValues);
    }
  });
  
  return newValues;
}

/**
 * Топологическая сортировка полей по зависимостям
 */
function topologicalSort(fields: FieldDefinition[]): FieldDefinition[] {
  const sorted: FieldDefinition[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const fieldMap = new Map(fields.map(f => [f.key, f]));

  function visit(field: FieldDefinition) {
    if (visited.has(field.key)) return;
    if (visiting.has(field.key)) {
      console.warn(`Обнаружена циклическая зависимость в поле: ${field.key}`);
      return;
    }

    visiting.add(field.key);

    // Обрабатываем зависимости
    if (field.dependsOn) {
      field.dependsOn.forEach(depKey => {
        const depField = fieldMap.get(depKey);
        if (depField) {
          visit(depField);
        }
      });
    }

    visiting.delete(field.key);
    visited.add(field.key);
    sorted.push(field);
  }

  fields.forEach(field => visit(field));
  
  return sorted;
}

/**
 * Валидация значений полей
 */
export function validateFieldValue(
  field: FieldDefinition,
  value: number | null
): { valid: boolean; error?: string } {
  if (value === null || value === undefined) {
    if (field.isCalculated) {
      return { valid: true }; // Вычисляемые поля могут быть null
    }
    return { valid: false, error: 'Значение не может быть пустым' };
  }

  if (isNaN(value)) {
    return { valid: false, error: 'Значение должно быть числом' };
  }

  if (value < 0) {
    return { valid: false, error: 'Значение не может быть отрицательным' };
  }

  return { valid: true };
}

/**
 * Форматирование значения для отображения
 */
export function formatFieldValue(value: number | null, decimals: number = 0): string {
  if (value === null || value === undefined) {
    return '—';
  }
  
  // Преобразуем в число, если это строка
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '—';
  }
  
  // Для целых чисел используем Math.round, чтобы избежать .00
  if (decimals === 0) {
    return Math.round(numValue).toString();
  }
  
  // Для процентов умножаем на 100
  if (decimals === 1) {
    return (numValue * 100).toFixed(decimals);
  }
  
  return numValue.toFixed(decimals);
}

/**
 * Вычисляет процент выполнения плана
 */
export function calculateCompletion(fact: number | null, plan: number | null): number | null {
  if (fact === null || plan === null || plan === 0) {
    return null;
  }
  return (fact / plan) * 100;
}

/**
 * Вычисляет отклонение от плана
 */
export function calculateDeviation(fact: number | null, plan: number | null): number | null {
  if (fact === null || plan === null) {
    return null;
  }
  return fact - plan;
}
