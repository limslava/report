import { Request, Response, NextFunction } from 'express';
import { DEPARTMENT_FULL_ACCESS_ROLES, DEPARTMENT_ROLES } from '../constants/roles';

export const authorizeDepartment = (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    const error: any = new Error('Authentication required');
    error.statusCode = 401;
    return next(error);
  }

  // Access is based on role only (no department binding).
  if (
    DEPARTMENT_FULL_ACCESS_ROLES.includes(user.role as any)
    || DEPARTMENT_ROLES.includes(user.role as any)
  ) {
    return next();
  }

  const error: any = new Error('Insufficient permissions');
  error.statusCode = 403;
  next(error);
};

export const authorizeRole = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      return next(error);
    }

    if (!allowedRoles.includes(user.role)) {
      const error: any = new Error('Insufficient permissions');
      error.statusCode = 403;
      return next(error);
    }

    next();
  };
};
