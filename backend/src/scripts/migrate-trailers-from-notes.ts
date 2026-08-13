/**
 * Одноразовый перенос номеров прицепов из «Примечаний» графика контейнеровозов
 * в новое поле trailer строк графика.
 *
 * Правило: если примечание начинается с номера прицепа вида «АМ9167/25»
 * (допускаются пробел вместо слэша и трёхзначный регион), номер переносится
 * в trailer, а остаток примечания сохраняется. Уже заполненный trailer не
 * перезаписывается. Запуск: npx tsx src/scripts/migrate-trailers-from-notes.ts
 * (боевой прогон) или с флагом --dry-run для предпросмотра.
 */
import { AppDataSource } from '../config/data-source';
import { OperationsPreviewState } from '../models/operations-preview-state.model';

const TRAILER_RE = /^\s*(АМ\s?\d{3,5}(?:[\/\s]\d{2,3})?)\s*(.*)$/i;

type PersonRow = {
  department?: string;
  trailer?: string;
  note?: string;
  name?: string;
};

const SCOPES = ['ktk_vvo_preview_v1', 'ktk_mow_preview_v1'];

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(OperationsPreviewState);

  for (const scopeKey of SCOPES) {
    const row = await repo.findOne({ where: { scopeKey } });
    if (!row) continue;
    const payload = row.payload as { peopleByMonth?: Record<string, PersonRow[]> };
    const byMonth = payload.peopleByMonth ?? {};
    let migrated = 0;

    for (const [monthValue, people] of Object.entries(byMonth)) {
      for (const person of people) {
        if (person.department !== 'Контейнеры') continue;
        if (person.trailer?.trim()) continue;
        const note = (person.note ?? '').trim();
        const match = note.match(TRAILER_RE);
        if (!match) continue;
        const trailer = match[1].trim();
        const rest = match[2].trim();
        console.log(`${scopeKey} ${monthValue} | ${person.name ?? '?'}: "${note}" -> прицеп "${trailer}"${rest ? `, примечание "${rest}"` : ''}`);
        if (!dryRun) {
          person.trailer = trailer;
          person.note = rest;
        }
        migrated += 1;
      }
    }

    if (migrated > 0 && !dryRun) {
      row.payload = payload as Record<string, unknown>;
      await repo.save(row);
    }
    console.log(`${scopeKey}: ${dryRun ? 'найдено' : 'перенесено'} ${migrated}`);
  }

  await AppDataSource.destroy();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
