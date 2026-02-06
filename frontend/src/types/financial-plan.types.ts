export type FinancialPlanRow = {
  rowId: string;
  rowType: 'group' | 'direction' | 'metric';
  groupCode?: string;
  groupLabel?: string;
  directionCode?: string;
  directionLabel?: string;
  metricCode?: string;
  metricLabel?: string;
  editable?: boolean;
  valueType?: 'number' | 'percent' | 'currency';
  months?: Array<{ month: number; value: number | null }>;
  yearTotal?: number | null;
};

export type FinancialVatRate = {
  id: string;
  effectiveFrom: string;
  rate: number;
  createdAt: string;
};

export type FinancialPlanResponse = {
  year: number;
  rows: FinancialPlanRow[];
  vat: {
    rates: FinancialVatRate[];
    warning: boolean;
  };
};
