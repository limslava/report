import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

/**
 * Простые справочники реестра диспетчеров: типы КТК, варианты НДС, операции.
 * Одна таблица на все виды (kind) — новый справочник добавляется без миграции.
 * Статусы живут отдельно (dispatcher_statuses): у них есть цвет чипа.
 */
export const DISPATCHER_DICTIONARY_KINDS = ['ktk_type', 'vat', 'operation', 'terminal_from', 'terminal_to'] as const;
export type DispatcherDictionaryKind = typeof DISPATCHER_DICTIONARY_KINDS[number];

/** Стартовые цвета (как в google-таблице отдела). */
export const DISPATCHER_DICTIONARY_SEED_COLORS: Partial<Record<DispatcherDictionaryKind, Record<string, string>>> = {
  vat: { 'НДС22%': '#38761d', нал: '#ffe599' },
};

/**
 * Стартовые значения (миграция + досев при старте). Порядок типов КТК —
 * по размеру, внутри размера от ходовых к специальным.
 */
export const DISPATCHER_DICTIONARY_SEED: Record<DispatcherDictionaryKind, string[]> = {
  ktk_type: [
    '20DC', '20HC', '20REF', '20SHC', '20OT', '20FR',
    '40DC', '40HC', '40REF', '40SHC', '40OT', '40FR',
  ],
  vat: ['НДС22%', 'без НДС', 'нал'],
  operation: ['выгрузка', 'погрузка', 'перемещение', 'вывоз'],
  // терминалы досеиваются при старте из уже заполненных заявок (см. ensureDispatcherDictionaryCatalog)
  terminal_from: [],
  terminal_to: [],
};

/** Максимальная длина значения справочника (терминалы — длинные названия с адресом). */
export const dispatcherDictionaryNameLimit = (kind: DispatcherDictionaryKind): number => {
  if (kind === 'vat' || kind === 'ktk_type') return 16;
  if (kind === 'terminal_from' || kind === 'terminal_to') return 128;
  return 64;
};

@Entity('dispatcher_dictionary_items')
@Unique('uq_dispatcher_dictionary_items_kind_name', ['kind', 'name'])
export class DispatcherDictionaryItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: DispatcherDictionaryKind;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  /** Цвет заливки значения в реестре (#rrggbb); null — без заливки. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  color!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
