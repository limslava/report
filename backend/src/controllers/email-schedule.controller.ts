import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/data-source';
import { EmailSchedule } from '../models/email-schedules.model';
import { logger } from '../utils/logger';
import { sendScheduledEmailNow } from '../services/email-scheduler.service';

const emailScheduleRepo = AppDataSource.getRepository(EmailSchedule);

export const getSchedules = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const schedules = await emailScheduleRepo.find({
      order: { department: 'ASC', frequency: 'ASC' },
    });
    res.json(schedules);
  } catch (error) {
    return next(error);
  }
};

export const getScheduleById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const schedule = await emailScheduleRepo.findOne({ where: { id } });
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    res.json(schedule);
  } catch (error) {
    return next(error);
  }
};

export const createSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { department, frequency, schedule, recipients } = req.body;
    const newSchedule = emailScheduleRepo.create({
      department,
      frequency,
      schedule,
      recipients,
      isActive: true,
    });
    await emailScheduleRepo.save(newSchedule);
    logger.info(`Email schedule created for ${department} (${frequency})`);
    res.status(201).json(newSchedule);
  } catch (error) {
    next(error);
  }
};

export const updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { department, frequency, schedule, recipients, isActive } = req.body;
    const existing = await emailScheduleRepo.findOne({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    existing.department = department ?? existing.department;
    existing.frequency = frequency ?? existing.frequency;
    existing.schedule = schedule ?? existing.schedule;
    existing.recipients = recipients ?? existing.recipients;
    existing.isActive = isActive ?? existing.isActive;
    await emailScheduleRepo.save(existing);
    logger.info(`Email schedule ${id} updated`);
    res.json(existing);
  } catch (error) {
    return next(error);
  }
};

export const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await emailScheduleRepo.delete({ id });
    if (result.affected === 0) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    logger.info(`Email schedule ${id} deleted`);
    res.status(204).send();
  } catch (error) {
    return next(error);
  }
};

export const triggerTestEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const schedule = await emailScheduleRepo.findOne({ where: { id } });
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    await sendScheduledEmailNow(schedule);
    schedule.lastSent = new Date();
    await emailScheduleRepo.save(schedule);

    logger.info(`Manual send executed for schedule ${id}`);
    res.json({ message: 'Email sent now' });
  } catch (error) {
    return next(error);
  }
};
