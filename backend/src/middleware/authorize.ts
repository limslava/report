import { Request, Response, NextFunction } from 'express';

export const authorizeDepartment = (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user;
  const department = req.params.department;

  // Roles that have full access to all departments
  const fullAccessRoles = ['admin', 'director', 'sales'];
  if (user && fullAccessRoles.includes(user.role)) {
    return next();
  }

  // Direction roles: can access only their own department
  const directionRoles = ['container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional'];
  if (user && directionRoles.includes(user.role) && user.role === department) {
    return next();
  }

  // Optional: allow container_vladivostok to see container_moscow and vice versa
  if (user && user.role.startsWith('container_') && department.startsWith('container_')) {
    return next();
  }

  const error: any = new Error('Access denied for this department');
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