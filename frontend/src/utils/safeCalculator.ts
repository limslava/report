/**
 * Безопасный калькулятор для вычисления формул без использования eval()
 * Поддерживает основные арифметические операции: +, -, *, /, ()
 */

type TokenType = 'NUMBER' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'VARIABLE';

interface Token {
  type: TokenType;
  value: string | number;
}

/**
 * Лексический анализ формулы
 */
function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const char = formula[i];

    // Пропускаем пробелы
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Числа
    if (/\d/.test(char) || (char === '.' && /\d/.test(formula[i + 1]))) {
      let num = '';
      while (i < formula.length && (/\d/.test(formula[i]) || formula[i] === '.')) {
        num += formula[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Операторы
    if (['+', '-', '*', '/'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char });
      i++;
      continue;
    }

    // Скобки
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Переменные (идентификаторы)
    if (/[a-zA-Z_]/.test(char)) {
      let varName = '';
      while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
        varName += formula[i];
        i++;
      }
      tokens.push({ type: 'VARIABLE', value: varName });
      continue;
    }

    throw new Error(`Неизвестный символ: ${char}`);
  }

  return tokens;
}

/**
 * Парсер с использованием алгоритма сортировочной станции (Shunting Yard)
 */
function parseToRPN(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const operators: Token[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

  for (const token of tokens) {
    if (token.type === 'NUMBER' || token.type === 'VARIABLE') {
      output.push(token);
    } else if (token.type === 'OPERATOR') {
      while (
        operators.length > 0 &&
        operators[operators.length - 1].type === 'OPERATOR' &&
        precedence[operators[operators.length - 1].value as string] >= precedence[token.value as string]
      ) {
        output.push(operators.pop()!);
      }
      operators.push(token);
    } else if (token.type === 'LPAREN') {
      operators.push(token);
    } else if (token.type === 'RPAREN') {
      while (operators.length > 0 && operators[operators.length - 1].type !== 'LPAREN') {
        output.push(operators.pop()!);
      }
      if (operators.length === 0) {
        throw new Error('Несоответствие скобок');
      }
      operators.pop(); // Удаляем LPAREN
    }
  }

  while (operators.length > 0) {
    const op = operators.pop()!;
    if (op.type === 'LPAREN' || op.type === 'RPAREN') {
      throw new Error('Несоответствие скобок');
    }
    output.push(op);
  }

  return output;
}

/**
 * Вычисление выражения в обратной польской нотации
 */
function evaluateRPN(rpn: Token[], variables: Record<string, number>): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (token.type === 'NUMBER') {
      stack.push(token.value as number);
    } else if (token.type === 'VARIABLE') {
      const varName = token.value as string;
      if (!(varName in variables)) {
        throw new Error(`Переменная не определена: ${varName}`);
      }
      stack.push(variables[varName]);
    } else if (token.type === 'OPERATOR') {
      if (stack.length < 2) {
        throw new Error('Недостаточно операндов');
      }
      const b = stack.pop()!;
      const a = stack.pop()!;
      switch (token.value) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) {
            throw new Error('Деление на ноль');
          }
          stack.push(a / b);
          break;
        default:
          throw new Error(`Неизвестный оператор: ${token.value}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Некорректное выражение');
  }

  return stack[0];
}

/**
 * Основная функция для безопасного вычисления формулы
 * @param formula - математическая формула
 * @param variables - объект с значениями переменных
 * @returns вычисленное значение или null при ошибке
 */
export function safeCalculate(formula: string, variables: Record<string, number | null>): number | null {
  try {
    // Проверяем, какие переменные нужны для формулы
    const requiredVars = extractVariables(formula);
    
    // Проверяем, что все необходимые переменные определены и имеют значения
    const cleanVariables: Record<string, number> = {};
    for (const varName of requiredVars) {
      const value = variables[varName];
      if (value === null || value === undefined || isNaN(value)) {
        return null; // Если хотя бы одна нужная переменная не определена, возвращаем null
      }
      cleanVariables[varName] = value;
    }

    const tokens = tokenize(formula);
    const rpn = parseToRPN(tokens);
    const result = evaluateRPN(rpn, cleanVariables);

    return isFinite(result) ? result : null;
  } catch (error) {
    // Тихо возвращаем null при ошибках
    return null;
  }
}

/**
 * Извлекает список переменных из формулы
 */
export function extractVariables(formula: string): string[] {
  try {
    const tokens = tokenize(formula);
    const variables = tokens
      .filter(token => token.type === 'VARIABLE')
      .map(token => token.value as string);
    return Array.from(new Set(variables)); // Убираем дубликаты
  } catch {
    return [];
  }
}

/**
 * Валидирует формулу
 */
export function validateFormula(formula: string): { valid: boolean; error?: string } {
  try {
    const tokens = tokenize(formula);
    parseToRPN(tokens);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}
