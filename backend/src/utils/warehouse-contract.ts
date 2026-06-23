export type WarehouseContractStatus = 'not_set' | 'active' | 'expiring' | 'expired';

export interface WarehouseContractState {
  contractStatus: WarehouseContractStatus;
  contractDaysRemaining: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDateOnlyUtc = (value: string): number => {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

const todayUtc = (now: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(
    parts.find((item) => item.type === type)?.value,
  );
  return Date.UTC(part('year'), part('month') - 1, part('day'));
};

export const getWarehouseContractState = (
  contractEndDate: string | null,
  now = new Date(),
  warningDays = 30,
): WarehouseContractState => {
  if (!contractEndDate) {
    return { contractStatus: 'not_set', contractDaysRemaining: null };
  }
  const daysRemaining = Math.round((parseDateOnlyUtc(contractEndDate) - todayUtc(now)) / DAY_MS);
  if (daysRemaining < 0) {
    return { contractStatus: 'expired', contractDaysRemaining: daysRemaining };
  }
  if (daysRemaining <= warningDays) {
    return { contractStatus: 'expiring', contractDaysRemaining: daysRemaining };
  }
  return { contractStatus: 'active', contractDaysRemaining: daysRemaining };
};
