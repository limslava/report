import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';

/**
 * «№ заказа» реестра (решение 15.09.2026): ГГММ-NNN — год и месяц даты заявки на момент
 * заведения и порядковый номер в этом месяце (с 001; после 999 — 1000, 1001…). Номер
 * выдаётся один раз и больше не меняется, даже если дату заявки перенесли.
 * Заявки без номера (новые и заведённые до появления номера) нумеруются по дате и порядку в реестре.
 */
/** «Иванов Иван Петрович» → «Иванов И.П.»; уже короткое имя остаётся как есть. */
export function shortResponsibleName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [surname, ...rest] = parts;
  const initials = rest.map((part) => (/^[A-ZА-ЯЁ]\.$/i.test(part) ? part.toUpperCase() : `${part[0].toUpperCase()}.`)).join('');
  return initials ? `${surname} ${initials}` : surname;
}

/**
 * «Ответственный» заявкам, заведённым до появления столбца: по записи «создана» в истории.
 * Заявки из импорта google-таблицы такой записи не имеют — остаются пустыми.
 */
export async function fillMissingDispatcherResponsible(): Promise<number> {
  const rows: Array<{ id: string; full_name: string }> = await AppDataSource.query(`
    SELECT DISTINCT ON (o.id) o.id, u.full_name
    FROM dispatcher_orders o
    JOIN dispatcher_order_changes c ON c.order_id = o.id AND c.action = 'create'
    JOIN users u ON u.id = c.user_id
    WHERE o.responsible IS NULL
    ORDER BY o.id, c.created_at
  `);
  for (const row of rows) {
    await AppDataSource.query('UPDATE dispatcher_orders SET responsible = $1 WHERE id = $2 AND responsible IS NULL', [
      shortResponsibleName(row.full_name),
      row.id,
    ]);
  }
  return rows.length;
}

export async function assignMissingDispatcherOrderNumbers(manager?: EntityManager): Promise<number> {
  const run = async (tx: EntityManager): Promise<number> => {
    // одна выдача номеров за раз — без дублей при одновременном заведении
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('dispatcher_order_number'))`);
    const result = await tx.query(`
      WITH maxes AS (
        SELECT split_part(order_number, '-', 1) AS prefix, max(split_part(order_number, '-', 2)::int) AS last
        FROM dispatcher_orders
        WHERE order_number ~ '^[0-9]{4}-[0-9]+$'
        GROUP BY 1
      ), numbered AS (
        SELECT id, to_char(order_date, 'YYMM') AS prefix,
          row_number() OVER (PARTITION BY to_char(order_date, 'YYMM') ORDER BY order_date, position, created_at, id) AS rn
        FROM dispatcher_orders
        WHERE order_number IS NULL
      )
      UPDATE dispatcher_orders AS o
      SET order_number = n.prefix || '-' || lpad((coalesce(m.last, 0) + n.rn)::text, greatest(3, length((coalesce(m.last, 0) + n.rn)::text)), '0')
      FROM numbered n LEFT JOIN maxes m ON m.prefix = n.prefix
      WHERE o.id = n.id
    `);
    return Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  };
  if (manager) return run(manager);
  return AppDataSource.transaction(run);
}
