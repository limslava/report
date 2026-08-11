import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { getJwtSecret } from '../config/env';

export const HR_IMPORT_TOKEN_SCOPE = 'farpost_import';

interface ImportJwtPayload {
  id: string;
  scope?: string;
}

/**
 * Аутентификация эндпоинта импорта резюме FarPost.
 *
 * Принимает два вида токенов:
 *  - обычный JWT пользователя (работа из веб-интерфейса);
 *  - import-token с scope=farpost_import — короткоживущий токен для
 *    Chrome-расширения, который даёт доступ ТОЛЬКО к импорту. Полный JWT
 *    в chrome.storage.local больше не хранится: расширение живёт на страницах
 *    чужого сайта, и утечка его хранилища не должна отдавать весь Report.
 *
 * Обратная проверка — в middleware/authenticate.ts: токен со scope
 * отклоняется на всех остальных эндпоинтах.
 */
export const authenticateHrImport = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret()) as ImportJwtPayload;
    if (decoded.scope && decoded.scope !== HR_IMPORT_TOKEN_SCOPE) {
      const error: any = new Error('Токен не подходит для этого эндпоинта');
      error.statusCode = 401;
      throw error;
    }

    const user = await AppDataSource.getRepository(User).findOne({ where: { id: decoded.id } });
    if (!user || !user.isActive) {
      // Деактивация пользователя отзывает и его import-токены.
      const error: any = new Error(user ? 'User account is deactivated' : 'User not found');
      error.statusCode = user ? 403 : 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      const authError: any = new Error('Invalid token');
      authError.statusCode = 401;
      return next(authError);
    }
    next(error);
  }
};
