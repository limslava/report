import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';
import { logger } from '../utils/logger';

/**
 * Middleware для валидации запросов с использованием Joi схем
 */
export const validate = (schema: Schema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Показываем все ошибки, а не только первую
      stripUnknown: false, // Не удаляем неизвестные поля автоматически
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn(`Validation error: ${errorMessage}`, {
        path: req.path,
        method: req.method,
        body: req.body,
      });

      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }

    // Заменяем req.body на валидированное значение
    req.body = value;
    return next();
  };
};

/**
 * Middleware для валидации параметров запроса
 */
export const validateParams = (schema: Schema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn(`Params validation error: ${errorMessage}`, {
        path: req.path,
        params: req.params,
      });

      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }

    req.params = value;
    return next();
  };
};

/**
 * Middleware для валидации query параметров
 */
export const validateQuery = (schema: Schema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn(`Query validation error: ${errorMessage}`, {
        path: req.path,
        query: req.query,
      });

      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }

    req.query = value;
    return next();
  };
};
