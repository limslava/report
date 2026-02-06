export function formatInt(value: number, locale: string = 'ru-RU'): string {
  return value.toLocaleString(locale);
}

export function formatPct(value: number, digits: number = 2): string {
  return `${value.toFixed(digits)}%`;
}
