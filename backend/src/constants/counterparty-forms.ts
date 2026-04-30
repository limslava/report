export type CounterpartyFormCode =
  | 'ooo'
  | 'ao'
  | 'pao';

export type CounterpartyFormItem = {
  code: CounterpartyFormCode;
  label: string;
  innLength: 10;
  isIndividual: boolean;
};

export const COUNTERPARTY_FORMS: CounterpartyFormItem[] = [
  { code: 'ooo', label: 'ООО', innLength: 10, isIndividual: false },
  { code: 'ao', label: 'АО', innLength: 10, isIndividual: false },
  { code: 'pao', label: 'ПАО', innLength: 10, isIndividual: false },
];

export const COUNTERPARTY_FORM_MAP = new Map(COUNTERPARTY_FORMS.map((item) => [item.code, item]));
