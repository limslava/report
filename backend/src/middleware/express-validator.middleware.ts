import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * Middleware для обработки результатов валидации express-validator
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: 'field' in error ? error.field : error.type,
      message: error.msg,
    }));

    logger.warn('Express-validator validation error', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
      body: req.body,
    });

    return res.status(400).json({
      error: 'Validation error',
      details: errorDetails,
    });
  }

  return next();
};
