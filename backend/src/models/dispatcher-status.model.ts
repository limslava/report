import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

/** Справочник статусов заявок диспетчерского журнала (перенесён из выпадающего списка google-таблицы). */
@Entity('dispatcher_statuses')
@Unique('uq_dispatcher_statuses_name', ['name'])
export class DispatcherStatus {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  /** Цвет чипа в формате #rrggbb. */
  @Column({ type: 'varchar', length: 7 })
  color!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
