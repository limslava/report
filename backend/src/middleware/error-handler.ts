import { Request, Response, NextFunction } from 'express';
import { QueryFailedError } from 'typeorm';
import { logger } from '../utils/logger';
import { isTransientDbError } from '../utils/db-errors';
import { dbCircuit } from '../utils/db-circuit';
import { dbMetrics } from '../utils/db-metrics';

interface CustomError extends Error {
  statusCode?: number;
  errors?: any[];
}

/**
 * Централизованный обработчик ошибок
 */
export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const sanitize = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    const sensitiveKeys = new Set([
      'password',
      'currentPassword',
      'newPassword',
      'passwordHash',
      'token',
      'refreshToken',
      'authorization',
    ]);
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item));
    }
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (sensitiveKeys.has(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitize(val);
      }
    }
    return result;
  };

  // Логируем ошибку
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: sanitize(req.body),
    params: req.params,
    query: req.query,
    user: req.user?.id,
  });

  // Определяем статус код
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details: any = undefined;

  // Обработка специфичных типов ошибок
  if (err instanceof QueryFailedError) {
    statusCode = 400;
    message = 'Database query failed';
    details = process.env.NODE_ENV === 'development' ? err.message : undefined;
  }

  // Ошибки валидации
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = err.errors;
  }

  // JWT ошибки
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Ошибки аутентификации
  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  }

  // Дублирование уникальных полей в БД
  if ((err as any).code === '23505') {
    statusCode = 409;
    message = 'Resource already exists';
  }

  // Недоступность БД (сетевые ошибки / рестарт)
  if (isTransientDbError(err)) {
    statusCode = 503;
    message = 'Database temporarily unavailable';
    res.locals.dbFailure = true;
    dbCircuit.recordFailure(err);
    dbMetrics.recordError(message);
  }

  // Нарушение foreign key constraint
  if ((err as any).code === '23503') {
    statusCode = 400;
    message = 'Invalid reference to related resource';
  }

  // Формируем ответ
  const response: any = {
    error: message,
    message,
    statusCode,
  };

  // В режиме разработки добавляем больше информации
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    if (details) {
      response.details = details;
    }
  }

  // Отправляем ответ
  res.status(statusCode).json(response);
};

/**
 * Обработчик для несуществующих роутов
 */
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
};

/**
 * Wrapper для async функций в роутах
 * Автоматически ловит ошибки и передаёт их в error handler
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
