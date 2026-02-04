import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/data-source';
import { SmtpConfig } from '../models/smtp-config.model';
import { logger } from '../utils/logger';
import * as nodemailer from 'nodemailer';

const smtpConfigRepo = AppDataSource.getRepository(SmtpConfig);

export const getSmtpConfig = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Получаем первую запись (предполагается только одна конфигурация)
    const [config] = await smtpConfigRepo.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    res.json(config || {});
  } catch (error) {
    next(error);
  }
};

export const saveSmtpConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { host, port, secure, user, password, from } = req.body;
    // Получаем существующую запись
    const [existing] = await smtpConfigRepo.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    let config: SmtpConfig;
    if (existing) {
      existing.host = host;
      existing.port = port;
      existing.secure = secure;
      existing.user = user;
      existing.password = password;
      existing.from = from;
      config = await smtpConfigRepo.save(existing);
    } else {
      config = smtpConfigRepo.create({ host, port, secure, user, password, from });
      await smtpConfigRepo.save(config);
    }
    logger.info('SMTP configuration saved');
    res.status(200).json(config);
  } catch (error) {
    return next(error);
  }
};

export const testSmtpConfig = async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const [config] = await smtpConfigRepo.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (!config) {
      return res.status(400).json({ error: 'SMTP configuration not found' });
    }
    // Создаём транспортер для проверки
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
    // Проверяем соединение
    await transporter.verify();
    logger.info('SMTP configuration test passed');
    return res.json({ success: true, message: 'SMTP connection successful' });
  } catch (error: any) {
    logger.error('SMTP test failed:', error);
    return res.status(500).json({
      success: false,
      message: 'SMTP connection failed',
      error: error.message
    });
  }
};