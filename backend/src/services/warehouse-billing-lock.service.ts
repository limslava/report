import { AppDataSource } from '../config/data-source';
import { WarehouseBillingPeriod } from '../models/warehouse-billing-period.model';

export const assertWarehouseDateIsOpen = async (
  counterpartyId: string,
  date: string,
): Promise<void> => {
  const period = await AppDataSource.getRepository(WarehouseBillingPeriod)
    .createQueryBuilder('period')
    .where('period.counterpartyId = :counterpartyId', { counterpartyId })
    .andWhere('period.periodFrom <= :date', { date })
    .andWhere('period.periodTo >= :date', { date })
    .getOne();
  if (period) {
    const error: any = new Error(
      `Период ${period.periodFrom}–${period.periodTo} закрыт. Изменение начислений запрещено`,
    );
    error.statusCode = 409;
    throw error;
  }
};
