jest.mock('../config/data-source', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

import { AppDataSource } from '../config/data-source';
import { assertWarehouseStorageRangeIsOpen } from './warehouse-billing-lock.service';

describe('warehouse billing lock service', () => {
  const getOne = jest.fn();
  const queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  } = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne,
  };
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSource.getRepository as jest.Mock).mockReturnValue({
      createQueryBuilder: jest.fn(() => queryBuilder),
    });
  });

  it('blocks storage interval changes that overlap a closed billing period', async () => {
    getOne.mockResolvedValue({
      periodFrom: '2026-06-10',
      periodTo: '2026-06-20',
    });

    await expect(assertWarehouseStorageRangeIsOpen(
      'counterparty-1',
      '2026-06-01',
      '2026-06-30',
    )).rejects.toThrow('Период 2026-06-10–2026-06-20 закрыт');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('period.periodFrom <= :to', { to: '2026-06-30' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('period.periodTo >= :from', { from: '2026-06-01' });
  });

  it('allows storage interval changes outside closed billing periods', async () => {
    getOne.mockResolvedValue(null);

    await expect(assertWarehouseStorageRangeIsOpen(
      'counterparty-1',
      '2026-07-01',
      '2026-07-05',
    )).resolves.toBeUndefined();
  });

  it('normalizes reversed storage intervals before checking closed periods', async () => {
    getOne.mockResolvedValue({
      periodFrom: '2026-06-10',
      periodTo: '2026-06-20',
    });

    await expect(assertWarehouseStorageRangeIsOpen(
      'counterparty-1',
      '2026-06-30',
      '2026-06-01',
    )).rejects.toThrow('Период 2026-06-10–2026-06-20 закрыт');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('period.periodFrom <= :to', { to: '2026-06-30' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('period.periodTo >= :from', { from: '2026-06-01' });
  });

  it('queries only for closed periods intersecting the storage interval', async () => {
    getOne.mockResolvedValue(null);

    await expect(assertWarehouseStorageRangeIsOpen(
      'counterparty-1',
      '2026-07-01',
      '2026-07-31',
    )).resolves.toBeUndefined();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'period.counterpartyId = :counterpartyId',
      { counterpartyId: 'counterparty-1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('period.periodFrom <= :to', { to: '2026-07-31' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('period.periodTo >= :from', { from: '2026-07-01' });
  });
});
