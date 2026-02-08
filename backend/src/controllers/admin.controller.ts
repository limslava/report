import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { AppSetting } from '../models/app-setting.model';
import { AuditLog } from '../models/audit-log.model';
import { Report } from '../models/reports.model';
import { logger } from '../utils/logger';
import { sendInvitationEmail } from '../services/email.service';
import { planWebSocketService } from '../services/websocket.service';
import { recordAuditLog } from '../services/audit-log.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Between, LessThanOrEqual, MoreThanOrEqual, QueryFailedError } from 'typeorm';

const userRepository = AppDataSource.getRepository(User);
const appSettingRepository = AppDataSource.getRepository(AppSetting);
const auditLogRepository = AppDataSource.getRepository(AuditLog);
const reportRepository = AppDataSource.getRepository(Report);

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.query;
    const where: any = {};
    if (role) where.role = role;

    const users = await userRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    // Remove password hash from response
    const safeUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      department: user.role, // for backward compatibility
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    res.json(safeUsers);
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, fullName, role } = req.body;

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      const error: any = new Error('User already exists');
      error.statusCode = 409;
      throw error;
    }

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('base64url');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    const user = userRepository.create({
      email,
      passwordHash: hashedPassword,
      fullName,
      role,
      isActive: true,
    });

    await userRepository.save(user);

    // Send invitation email (department is now role)
    await sendInvitationEmail(email, fullName, role, temporaryPassword);

    await recordAuditLog({
      action: 'USER_INVITED',
      userId: req.user?.id,
      entityType: 'user',
      entityId: user.id,
      details: { email, role },
      req,
    });

    logger.info(`User invited: ${email} (${role})`);

    res.status(201).json({
      message: 'User invited successfully',
      userId: user.id,
      emailSent: true,
    });
  } catch (error) {
    if (error instanceof QueryFailedError && (error as any).code === '23505') {
      const duplicateError: any = new Error('Пользователь с таким email уже существует');
      duplicateError.statusCode = 409;
      return next(duplicateError);
    }
    next(error);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { email, fullName, role, isActive } = req.body;

    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (typeof email === 'string' && email.trim()) {
      user.email = email.trim().toLowerCase();
    }
    if (fullName) user.fullName = fullName;
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;

    await userRepository.save(user);

    await recordAuditLog({
      action: 'USER_UPDATED',
      userId: req.user?.id,
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email, role: user.role, isActive: user.isActive },
      req,
    });

    logger.info(`User updated: ${id}`);

    res.json({
      message: 'User updated',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.role, // for backward compatibility
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    if (error instanceof QueryFailedError && (error as any).code === '23505') {
      const duplicateError: any = new Error('Пользователь с таким email уже существует');
      duplicateError.statusCode = 409;
      return next(duplicateError);
    }
    next(error);
  }
};

export const reassignAndDeleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const targetUserIdRaw = (req.body?.targetUserId ?? req.body?.target_user_id ?? '').toString().trim();
    const targetUserId = targetUserIdRaw;

    if (!targetUserId || targetUserId === id) {
      const error: any = new Error('Укажите корректного целевого пользователя');
      error.statusCode = 400;
      throw error;
    }

    const [sourceUser, targetUser] = await Promise.all([
      userRepository.findOne({ where: { id } }),
      userRepository.findOne({ where: { id: targetUserId } }),
    ]);

    if (!sourceUser) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    if (!targetUser) {
      const error: any = new Error('Target user not found');
      error.statusCode = 404;
      throw error;
    }

    await AppDataSource.transaction(async (manager) => {
      const reassignMap = [
        { table: 'planning_daily_values', column: 'updated_by_id' },
        { table: 'plan_history', column: 'changed_by_id' },
        { table: 'operational_data', column: 'created_by' },
        { table: 'manual_entries', column: 'entered_by' },
        { table: 'initial_balances', column: 'entered_by' },
        { table: 'monthly_plans', column: 'created_by_id' },
      ];

      for (const item of reassignMap) {
        await manager.query(
          `UPDATE ${item.table} SET ${item.column} = $1 WHERE ${item.column} = $2`,
          [targetUserId, id]
        );
      }

      await manager.delete(User, { id });
    });

    await recordAuditLog({
      action: 'USER_REASSIGN_DELETE',
      userId: req.user?.id,
      entityType: 'user',
      entityId: id,
      details: { targetUserId },
      req,
    });

    logger.info(`User ${id} reassigned to ${targetUserId} and deleted`);
    res.json({ message: 'Пользователь удален, связанные записи переназначены' });
  } catch (error) {
    next(error);
  }
};

export const resetUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const temporaryPassword = crypto.randomBytes(8).toString('base64url');
    user.passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await userRepository.save(user);

    try {
      await sendInvitationEmail(user.email, user.fullName, user.role, temporaryPassword);
    } catch (mailError) {
      logger.warn(`Password reset email failed for user ${user.id}`, mailError as any);
    }

    await recordAuditLog({
      action: 'USER_PASSWORD_RESET',
      userId: req.user?.id,
      entityType: 'user',
      entityId: user.id,
      req,
    });

    res.json({
      message: 'Пароль пользователя сброшен',
      temporaryPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await userRepository.findOne({ where: { id } });
    if (!user) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    try {
      // Try to delete the user
      await userRepository.remove(user);
      
      logger.info(`User deleted: ${id}`);
      await recordAuditLog({
        action: 'USER_DELETED',
        userId: req.user?.id,
        entityType: 'user',
        entityId: id,
        req,
      });
      res.json({ message: 'User deleted' });
    } catch (deleteError: any) {
      // Check if it's a foreign key constraint violation
      if (deleteError.code === '23503') {
        const error: any = new Error('Невозможно удалить пользователя, так как у него есть связанные данные в системе. Сначала удалите или переназначьте связанные записи.');
        error.statusCode = 409;
        throw error;
      }
      throw deleteError;
    }
  } catch (error) {
    next(error);
  }
};

export const getAuditLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, action, startDate, endDate, limit } = req.query;
    const where: any = {};

    if (userId) where.userId = String(userId);
    if (action) where.action = String(action);

    const normalizeDate = (value: string, mode: 'start' | 'end') => {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return mode === 'start'
          ? new Date(`${trimmed}T00:00:00.000Z`)
          : new Date(`${trimmed}T23:59:59.999Z`);
      }
      return new Date(trimmed);
    };

    if (startDate && endDate) {
      where.createdAt = Between(
        normalizeDate(String(startDate), 'start'),
        normalizeDate(String(endDate), 'end')
      );
    } else if (startDate) {
      where.createdAt = MoreThanOrEqual(normalizeDate(String(startDate), 'start'));
    } else if (endDate) {
      where.createdAt = LessThanOrEqual(normalizeDate(String(endDate), 'end'));
    }

    const safeLimit = Math.min(Number(limit) || 200, 1000);
    const logs = await auditLogRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
};

export const getSystemStats = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const userCount = await userRepository.count();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyReports, monthlyReports] = await Promise.all([
      reportRepository.count({
        where: {
          type: 'daily',
          generatedAt: MoreThanOrEqual(startOfDay),
        },
      }),
      reportRepository.count({
        where: {
          type: 'monthly',
          generatedAt: MoreThanOrEqual(startOfMonth),
        },
      }),
    ]);

    const lastBackupSetting = await appSettingRepository.findOne({ where: { key: 'last_backup' } });
    const uptimeSeconds = Math.floor(process.uptime());

    res.json({
      users: userCount,
      activeSessions: planWebSocketService.getClientCount(),
      dailyReports,
      monthlyReports,
      lastBackup: lastBackupSetting?.value ?? null,
      uptime: uptimeSeconds,
    });
  } catch (error) {
    next(error);
  }
};

export const getAppSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const appTitle = await appSettingRepository.findOne({ where: { key: 'app_title' } });
    res.json({
      appTitle: appTitle?.value || 'Логистика & Отчетность',
    });
  } catch (error) {
    next(error);
  }
};

export const updateAppSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = (req.body?.appTitle ?? '').toString().trim();
    const appTitle = raw.length > 0 ? raw : 'Логистика & Отчетность';

    let setting = await appSettingRepository.findOne({ where: { key: 'app_title' } });
    if (!setting) {
      setting = appSettingRepository.create({
        key: 'app_title',
        value: appTitle,
      });
    } else {
      setting.value = appTitle;
    }

    await appSettingRepository.save(setting);
    res.json({ message: 'Настройки приложения обновлены', appTitle: setting.value });
  } catch (error) {
    next(error);
  }
};
