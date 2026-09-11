import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Строка журнала диспетчерского отдела (КТК Владивосток): одно задание на
 * перевозку контейнера. Поля повторяют рабочую google-таблицу диспетчеров;
 * числовые на вид колонки (вес, ставки, простой) намеренно хранятся текстом —
 * диспетчера пишут туда «12000+3800», «2x2500», «к 10» и т.п.
 */
@Entity('dispatcher_orders')
@Index('idx_dispatcher_orders_date', ['orderDate'])
export class DispatcherOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_date', type: 'date' })
  orderDate!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  status!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  info!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  client!: string | null;

  @Column({ name: 'driver_name', type: 'varchar', length: 255, nullable: true })
  driverName!: string | null;

  @Column({ name: 'vehicle_plate', type: 'varchar', length: 64, nullable: true })
  vehiclePlate!: string | null;

  @Column({ name: 'ktk_number', type: 'varchar', length: 32, nullable: true })
  ktkNumber!: string | null;

  @Column({ name: 'ktk_type', type: 'varchar', length: 16, nullable: true })
  ktkType!: string | null;

  @Column({ name: 'gross_weight', type: 'varchar', length: 64, nullable: true })
  grossWeight!: string | null;

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  operation!: string | null;

  @Column({ name: 'terminal_from', type: 'varchar', length: 255, nullable: true })
  terminalFrom!: string | null;

  @Column({ name: 'slot_from', type: 'varchar', length: 64, nullable: true })
  slotFrom!: string | null;

  @Column({ name: 'pin_from', type: 'varchar', length: 64, nullable: true })
  pinFrom!: string | null;

  @Column({ name: 'submit_time', type: 'varchar', length: 32, nullable: true })
  submitTime!: string | null;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress!: string | null;

  @Column({ name: 'terminal_to', type: 'varchar', length: 255, nullable: true })
  terminalTo!: string | null;

  @Column({ name: 'slot_to', type: 'varchar', length: 64, nullable: true })
  slotTo!: string | null;

  @Column({ name: 'pin_to', type: 'varchar', length: 64, nullable: true })
  pinTo!: string | null;

  @Column({ name: 'driver_rate', type: 'varchar', length: 32, nullable: true })
  driverRate!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  vat!: string | null;

  @Column({ name: 'client_rate', type: 'varchar', length: 32, nullable: true })
  clientRate!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passes!: string | null;

  @Column({ name: 'extra_address', type: 'text', nullable: true })
  extraAddress!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  demurrage!: string | null;

  @Column({ name: 'order_on_vehicle', type: 'boolean', default: false })
  orderOnVehicle!: boolean;

  @Column({ name: 'invoice_sent', type: 'boolean', default: false })
  invoiceSent!: boolean;

  @Column({ name: 'extra_ton', type: 'varchar', length: 64, nullable: true })
  extraTon!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  seal!: string | null;

  @Column({ type: 'boolean', default: false })
  recoupling!: boolean;

  @Column({ name: 'driver_remarks', type: 'text', nullable: true })
  driverRemarks!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
