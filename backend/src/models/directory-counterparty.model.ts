import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Справочник контрагентов (раздел «Справочники → Контрагенты»).
 * Самостоятельный список: наполняется вручную добавлением по ИНН
 * (реквизиты подтягиваются из ФНС) и НЕ зеркалит контрагентов БП договоров.
 * В дальнейшем к контрагенту привяжутся его водители/техника/прицепы.
 */
@Entity('directory_counterparties')
@Index('uq_directory_counterparties_inn', ['inn'], { unique: true })
export class DirectoryCounterparty {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 12 })
  inn!: string;

  @Column({ name: 'name_full', type: 'varchar', length: 500 })
  nameFull!: string;

  @Column({ name: 'name_short', type: 'varchar', length: 255, default: '' })
  nameShort!: string;

  @Column({ type: 'varchar', length: 15, default: '' })
  ogrn!: string;

  @Column({ type: 'varchar', length: 9, default: '' })
  kpp!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  address!: string;

  /** откуда пришли реквизиты: fns | manual */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source!: 'fns' | 'manual';

  @Column({ type: 'varchar', length: 500, default: '' })
  note!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
