import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Личные настройки интерфейса сотрудника (столбцы, ширина, закрепление, фильтры, масштаб
 * реестра и т. п.). Хранятся в учётной записи, а не в браузере: одинаковы на любом
 * компьютере и телефоне.
 */
@Entity('user_ui_preferences')
@Index('uq_user_ui_preferences_user_key', ['userId', 'key'], { unique: true })
export class UserUiPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'jsonb', nullable: true })
  value!: unknown;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
