export type CounterpartyFormCode =
  | 'ooo'
  | 'ao'
  | 'pao'
  | 'gup'
  | 'mup'
  | 'ano'
  | 'fond'
  | 'uchrezhdenie'
  | 'assotsiaciya'
  | 'ip'
  | 'fizlico';

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
  { code: 'gup', label: 'ГУП', innLength: 10, isIndividual: false },
  { code: 'mup', label: 'МУП', innLength: 10, isIndividual: false },
  { code: 'ano', label: 'АНО', innLength: 10, isIndividual: false },
  { code: 'fond', label: 'Фонд', innLength: 10, isIndividual: false },
  { code: 'uchrezhdenie', label: 'Учреждение', innLength: 10, isIndividual: false },
  { code: 'assotsiaciya', label: 'Ассоциация/союз', innLength: 10, isIndividual: false },
  { code: 'ip', label: 'ИП', innLength: 12, isIndividual: true },
  { code: 'fizlico', label: 'Физическое лицо', innLength: 12, isIndividual: true },
];

export const COUNTERPARTY_FORM_MAP = new Map(COUNTERPARTY_FORMS.map((item) => [item.code, item]));
