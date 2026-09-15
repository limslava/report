import { NextFunction, Request, Response, Router } from 'express';
import { AppDataSource } from '../config/data-source';
import { authenticate } from '../middleware/authenticate';
import { UserUiPreference } from '../models/user-ui-preference.model';

/** Личные настройки интерфейса текущего сотрудника: GET ?prefix=dj- и PUT /:key {value}. */
const router = Router();
router.use(authenticate);

const KEY_PATTERN = /^[A-Za-z0-9:._-]{1,128}$/;
const MAX_VALUE_BYTES = 256 * 1024;
const repository = () => AppDataSource.getRepository(UserUiPreference);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
    const query = repository().createQueryBuilder('pref').where('pref.userId = :userId', { userId });
    if (prefix) query.andWhere('pref.key LIKE :prefix', { prefix: `${prefix.replace(/[%_\\]/g, (char) => `\\${char}`)}%` });
    const rows = await query.getMany();
    res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  } catch (error) {
    next(error);
  }
});

router.put('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    if (!KEY_PATTERN.test(key)) {
      res.status(400).json({ message: 'Некорректный ключ настройки' });
      return;
    }
    const value = (req.body ?? {}).value ?? null;
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_VALUE_BYTES) {
      res.status(413).json({ message: 'Настройка слишком большая' });
      return;
    }
    await repository().upsert({ userId: req.user!.id, key, value, updatedAt: new Date() }, ['userId', 'key']);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export const uiPreferencesRouter = router;
