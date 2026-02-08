import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/http';

/**
 * Middleware для проверки прав администратора
 * Требует, чтобы пользователь был аутентифицирован и имел роль 'admin'
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  
  if (!user) {
    return sendError(res, 401, 'Требуется аутентификация', { code: 'UNAUTHORIZED' });
  }
  
  if (user.role !== 'admin') {
    return sendError(res, 403, 'Требуются права администратора', {
      code: 'FORBIDDEN',
      requiredRole: 'admin',
      userRole: user.role,
    });
  }
  
  return next();
};

/**
 * Middleware для проверки прав администратора или определенных ролей
 */
export const roleOrAdmin = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return sendError(res, 401, 'Требуется аутентификация', { code: 'UNAUTHORIZED' });
    }
    
    // Администратор имеет доступ ко всему
    if (user.role === 'admin') {
      return next();
    }
    
    // Проверяем, есть ли у пользователя одна из разрешенных ролей
    if (allowedRoles.includes(user.role)) {
      return next();
    }
    
    return sendError(res, 403, 'Недостаточно прав', {
      code: 'FORBIDDEN',
      requiredRoles: ['admin', ...allowedRoles],
      userRole: user.role,
    });
  };
};

/**
 * Middleware для проверки доступа к категории плана
 * Администратор имеет доступ ко всем категориям
 * Пользователи могут иметь доступ только к определенным категориям
 */
export const categoryAccess = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  // const category = req.params.category; // Зарезервировано для будущей логики
  
  if (!user) {
    return sendError(res, 401, 'Требуется аутентификация', { code: 'UNAUTHORIZED' });
  }
  
  // Администратор имеет доступ ко всем категориям
  if (user.role === 'admin') {
    return next();
  }
  
  // В реальном приложении здесь может быть логика сопоставления ролей и категорий
  // Например, пользователь с ролью 'КТК_менеджер' имеет доступ только к категории 'КТК'
  
  // Временная реализация: разрешаем доступ всем аутентифицированным пользователям
  // для просмотра, но не для редактирования
  if (req.method === 'GET') {
    return next();
  }
  
  // Для операций записи требуем права администратора
  return sendError(res, 403, 'Требуются права администратора для изменения данных', {
    code: 'FORBIDDEN',
    userRole: user.role,
  });
};
