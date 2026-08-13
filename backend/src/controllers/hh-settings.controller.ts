import { Request, Response, NextFunction } from 'express';
import { getHhHealth, getHhSettings, updateHhSettings } from '../services/hh-settings.service';

export const getHhConnectionStatus = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getHhSettings());
  } catch (error) {
    next(error);
  }
};

export const saveHhSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await updateHhSettings(req.body));
  } catch (error) {
    next(error);
  }
};

export const getHhModuleHealth = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getHhHealth());
  } catch (error) {
    next(error);
  }
};
