import { describe, expect, it } from 'vitest';
import {
  amountWithoutVat,
  buildOrderText,
  isCompletedStatus,
  normalizeTimeInput,
  parseAmount,
  personKey,
  plateKey,
  shortPersonName,
  vatRateOf,
} from './dispatcherJournalUtils';

describe('dispatcherJournalUtils', () => {
  it('сокращает ФИО до фамилии и инициалов', () => {
    expect(shortPersonName('Чугунов Иван Петрович')).toBe('Чугунов И.П.');
    expect(shortPersonName('Чугунов И.П.')).toBe('Чугунов И.П.');
    expect(shortPersonName('Чугунов')).toBe('Чугунов');
    expect(personKey('чугунов иван петрович')).toBe(personKey('Чугунов И. П.'));
  });

  it('нормализует госномер', () => {
    expect(plateKey('M604XP 125')).toBe(plateKey('М604ХР125'));
  });

  it('разбирает суммы из текста', () => {
    expect(parseAmount('41 000')).toBe(41000);
    expect(parseAmount('12000+3800')).toBe(15800);
    expect(parseAmount('2x2500')).toBe(5000);
    expect(parseAmount('27,5')).toBe(27.5);
    expect(parseAmount('к 10')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('считает «Без НДС» из ставки и пропусков', () => {
    expect(vatRateOf('НДС22%')).toBe(22);
    expect(vatRateOf('нал')).toBe(0);
    expect(amountWithoutVat('24400', '', 'НДС22%')).toBe(20000);
    expect(amountWithoutVat('20000', '2x500', 'нал')).toBe(21000);
    expect(amountWithoutVat('', '', 'НДС22%')).toBeNull();
  });

  it('приводит ручной ввод к времени', () => {
    expect(normalizeTimeInput('8')).toBe('08:00');
    expect(normalizeTimeInput('830')).toBe('08:30');
    expect(normalizeTimeInput('18.30')).toBe('18:30');
    expect(normalizeTimeInput('к 10')).toBe('к 10');
  });

  it('узнаёт выполненный статус', () => {
    expect(isCompletedStatus('выполнена')).toBe(true);
    expect(isCompletedStatus('новая')).toBe(false);
  });

  it('собирает текст заказа', () => {
    const text = buildOrderText({
      orderDate: '2026-09-01',
      ktkNumber: 'TRZU1103134',
      ktkType: '40HC',
      grossWeight: '9200',
      operation: 'выгрузка',
      terminalFrom: 'Сухой порт',
      slotFrom: 'ам 9164',
      pinFrom: null,
      deliveryAddress: 'г.Артем Солнечная 46 с 4',
      submitTime: '10:00',
      terminalTo: 'Первомайский',
      vehiclePlate: 'Н099СВ 125',
    });
    expect(text.split('\n')[0]).toBe('ДАТА 01.09.26');
    expect(text).toContain('*Номер контейнера* TRZU1103134');
    expect(text).toContain('*Пин*\n');
    expect(text).toContain('*Примечание* Н099СВ 125\n❗️');
  });
});
