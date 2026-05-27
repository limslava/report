export type CounterpartyFormCode =
  | 'ooo'
  | 'ao'
  | 'pao'
  | 'zao'
  | 'ip';

export type CounterpartyFormItem = {
  code: CounterpartyFormCode;
  label: string;
  innLength: 10 | 12;
  isIndividual: boolean;
};

export const COUNTERPARTY_FORMS: CounterpartyFormItem[] = [
  { code: 'ooo', label: 'ООО', innLength: 10, isIndividual: false },
  { code: 'ao', label: 'АО', innLength: 10, isIndividual: false },
  { code: 'pao', label: 'ПАО', innLength: 10, isIndividual: false },
  { code: 'zao', label: 'ЗАО', innLength: 10, isIndividual: false },
  { code: 'ip', label: 'ИП', innLength: 12, isIndividual: true },
];

export const COUNTERPARTY_FORM_MAP = new Map(COUNTERPARTY_FORMS.map((item) => [item.code, item]));
