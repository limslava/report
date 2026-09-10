import { mapDay } from './uchet-ts.service';

/** Реальный фрагмент ответа SimpleWozi, снятый с боевого API 11.09.2026. */
const REAL_DAY = {
  date: '2026-09-09',
  received: { autocarrier: 12, container: 6, grid: 0, curtain_truck: 0, undefined: 0 },
  sent: {
    autocarrier: { total: 3, own: 1, hired: 2 },
    container: 4,
    grid: 1,
    curtain_truck: 2,
    undefined: 0,
  },
};

describe('uchet-ts mapDay', () => {
  it('разбирает реальную схему SimpleWozi', () => {
    const mapped = mapDay(REAL_DAY as unknown as Record<string, unknown>);
    expect(mapped).not.toBeNull();
    expect(mapped!.statDate).toBe('2026-09-09');
    // КТК = контейнер + сетка
    expect(mapped!.ktkReceived).toBe(6);
    expect(mapped!.ktkSent).toBe(5);
    expect(mapped!.autocarrierReceived).toBe(12);
    expect(mapped!.autocarrierSent).toBe(3);
    expect(mapped!.autocarrierSentOwn).toBe(1);
    expect(mapped!.autocarrierSentHired).toBe(2);
    expect(mapped!.curtainReceived).toBe(0);
    expect(mapped!.curtainSent).toBe(2);
    // «в ожидании» их API не отдаёт
    expect(mapped!.ktkWaiting).toBeNull();
    expect(mapped!.autocarrierWaiting).toBeNull();
    expect(mapped!.curtainWaiting).toBeNull();
  });

  it('возвращает null для записи без даты', () => {
    expect(mapDay({ received: {}, sent: {} })).toBeNull();
  });

  it('переживает отсутствующие блоки received/sent', () => {
    const mapped = mapDay({ date: '2026-09-01' });
    expect(mapped).not.toBeNull();
    expect(mapped!.ktkReceived).toBeNull();
    expect(mapped!.autocarrierSent).toBeNull();
  });
});
