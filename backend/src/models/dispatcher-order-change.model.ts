import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DispatcherOrderChangeAction = 'create' | 'update' | 'delete' | 'move' | 'import' | 'sort';

/**
 * История изменений реестра диспетчеров: кто, когда, какое поле, было → стало.
 * Снимок даты/КТК/клиента хранится в записи — история читается и после
 * удаления заявки. Смотрят администратор и руководитель КТК.
 */
@Entity('dispatcher_order_changes')
@Index('idx_dispatcher_order_changes_created', ['createdAt'])
@Index('idx_dispatcher_order_changes_order', ['orderId'])
export class DispatcherOrderChange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** заявка (null — массовое действие, например импорт) */
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  action!: DispatcherOrderChangeAction;

  /** поле заявки (для update) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  field!: string | null;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue!: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue!: string | null;

  /** снимок заявки на момент изменения — для чтения истории без самой заявки */
  @Column({ name: 'order_date', type: 'date', nullable: true })
  orderDate!: string | null;

  @Column({ name: 'ktk_number', type: 'text', nullable: true })
  ktkNumber!: string | null;

  /** «№ заказа» на момент изменения (у записей до его появления — берётся из заявки) */
  @Column({ name: 'order_number', type: 'varchar', length: 16, nullable: true })
  orderNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  client!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
