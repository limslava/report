import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { AppSetting } from '../models/app-setting.model';
import { logger } from '../utils/logger';
import { sendError } from '../utils/http';
import { sendInvitationEmail, sendPasswordResetEmail } from '../services/email.service';
import { getJwtExpiresIn, getJwtSecret } from '../config/env';

const userRepository = AppDataSource.getRepository(User);
const appSettingRepository = AppDataSource.getRepository(AppSetting);

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required', { code: 'VALIDATION_ERROR' });
    }

    const user = await userRepository.findOne({ where: { email } });
    
    if (!user) {
      logger.warn('User not found', { email });
      return sendError(res, 401, 'Invalid credentials', { code: 'INVALID_CREDENTIALS' });
    }

    if (!user.isActive) {
      logger.warn('Inactive user login attempt', { email });
      return sendError(res, 403, 'User account is deactivated', { code: 'FORBIDDEN' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      logger.warn('Invalid password', { email });
      return sendError(res, 401, 'Invalid credentials', { code: 'INVALID_CREDENTIALS' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: getJwtExpiresIn() }
    );

    logger.info('Login successful', { email, userId: user.id });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.role,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Login error', error);
    return next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, fullName, role } = req.body;

    // Check if user already exists
    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      const error: any = new Error('User already exists');
      error.statusCode = 409;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = userRepository.create({
      email,
      passwordHash: hashedPassword,
      fullName,
      role,
    });

    await userRepository.save(user);

    // Send invitation email (department is now role)
    await sendInvitationEmail(email, fullName, role, password);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: getJwtExpiresIn() }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        department: user.role, // for backward compatibility
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      // For security, don't reveal that user doesn't exist
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      `${getJwtSecret()}${user.passwordHash}`,
      { expiresIn: '1h' }
    );

    await sendPasswordResetEmail(user.email, user.fullName, resetToken);

    return res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    return next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return sendError(res, 400, 'Token and password are required', { code: 'VALIDATION_ERROR' });
    }

    let payload: { id: string; email: string };
    try {
      const decoded = jwt.decode(token) as { id?: string; email?: string } | null;
      if (!decoded?.id) {
        return sendError(res, 400, 'Invalid token', { code: 'INVALID_TOKEN' });
      }

      const user = await userRepository.findOne({ where: { id: decoded.id } });
      if (!user) {
        return sendError(res, 404, 'User not found', { code: 'NOT_FOUND' });
      }

      payload = jwt.verify(token, `${getJwtSecret()}${user.passwordHash}`) as { id: string; email: string };

      const hashedPassword = await bcrypt.hash(password, 12);
      user.passwordHash = hashedPassword;
      await userRepository.save(user);
    } catch (err: any) {
      return sendError(res, 400, 'Invalid or expired token', { code: 'INVALID_TOKEN' });
    }

    return res.json({ message: 'Password reset successfully', userId: payload.id });
  } catch (error) {
    return next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      const error: any = new Error('User not authenticated');
      error.statusCode = 401;
      throw error;
    }

    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      const error: any = new Error('Current password is incorrect');
      error.statusCode = 400;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.passwordHash = hashedPassword;
    await userRepository.save(user);

    res.json({ message: 'Password changed successfully' });
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
