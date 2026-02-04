import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { AppSetting } from '../models/app-setting.model';
import { logger } from '../utils/logger';

const DEFAULT_APP_TITLE = 'Логистика & Отчетность';
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || '2720233@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || '312046';

export async function ensureDefaultAdmin(): Promise<void> {
  const userRepository = AppDataSource.getRepository(User);
  const appSettingsRepository = AppDataSource.getRepository(AppSetting);

  const anyAdmin = await userRepository.findOne({ where: { role: 'admin' } });
  if (!anyAdmin) {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
    const admin = userRepository.create({
      email: DEFAULT_ADMIN_EMAIL,
      passwordHash,
      fullName: 'Администратор системы',
      role: 'admin',
      isActive: true,
    });
    await userRepository.save(admin);
    logger.info(`Default admin created: ${DEFAULT_ADMIN_EMAIL}`);
  }

  const appTitle = await appSettingsRepository.findOne({ where: { key: 'app_title' } });
  if (!appTitle) {
    const setting = appSettingsRepository.create({
      key: 'app_title',
      value: DEFAULT_APP_TITLE,
    });
    await appSettingsRepository.save(setting);
    logger.info('Default app title created');
  }
}
