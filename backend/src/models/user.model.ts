import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  role!:
    | 'container_vladivostok'
    | 'container_moscow'
    | 'railway'
    | 'autotruck'
    | 'additional'
    | 'to_auto'
    | 'sales'
    | 'manager_sales'
    | 'manager_ktk_vvo'
    | 'manager_ktk_mow'
    | 'manager_auto'
    | 'manager_rail'
    | 'manager_extra'
    | 'manager_to'
    | 'financer'
    | 'director'
    | 'admin';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Virtual property for plain password (not stored)
  password?: string;
}
