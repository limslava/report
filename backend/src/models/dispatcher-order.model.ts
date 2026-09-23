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
 * все текстовые поля — text без ограничения длины: в таблице отдела в «ставку»
 * пишут расчёт на несколько строк, в «слот» — e-mail и т.п. (импорт 2026-09-14);
 * числовые на вид колонки (вес, ставки, простой) намеренно хранятся текстом —
 * диспетчера пишут туда «12000+3800», «2x2500», «к 10» и т.п.
 */
@Entity('dispatcher_orders')
@Index('idx_dispatcher_orders_date', ['orderDate'])
@Index('idx_dispatcher_orders_date_position', ['orderDate', 'position'])
export class DispatcherOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_date', type: 'date' })
  orderDate!: string;

  /**
   * Ручной порядок строки во всей таблице (перетаскивание, как в google-таблице;
   * дата на порядок не влияет). Дробное число: строка, брошенная между соседями,
   * получает середину их значений — без пересчёта остальных. Новые строки —
   * время создания в мс (встают в конец).
   */
  @Column({ type: 'double precision', default: 0 })
  position!: number;

  /** «№ заказа» ГГММ-NNN: выдаётся при заведении и не меняется (dispatcher-order-number.service). */
  @Index('uq_dispatcher_orders_order_number', { unique: true })
  @Column({ name: 'order_number', type: 'varchar', length: 16, nullable: true })
  orderNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  status!: string | null;

  @Column({ type: 'text', nullable: true })
  info!: string | null;

  @Column({ type: 'text', nullable: true })
  client!: string | null;

  @Column({ name: 'driver_name', type: 'text', nullable: true })
  driverName!: string | null;

  @Column({ name: 'vehicle_plate', type: 'text', nullable: true })
  vehiclePlate!: string | null;

  @Column({ name: 'ktk_number', type: 'text', nullable: true })
  ktkNumber!: string | null;

  @Column({ name: 'ktk_type', type: 'text', nullable: true })
  ktkType!: string | null;

  @Column({ name: 'gross_weight', type: 'text', nullable: true })
  grossWeight!: string | null;

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  @Column({ type: 'text', nullable: true })
  operation!: string | null;

  @Column({ name: 'terminal_from', type: 'text', nullable: true })
  terminalFrom!: string | null;

  @Column({ name: 'slot_from', type: 'text', nullable: true })
  slotFrom!: string | null;

  @Column({ name: 'pin_from', type: 'text', nullable: true })
  pinFrom!: string | null;

  @Column({ name: 'submit_time', type: 'text', nullable: true })
  submitTime!: string | null;

  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress!: string | null;

  @Column({ name: 'terminal_to', type: 'text', nullable: true })
  terminalTo!: string | null;

  @Column({ name: 'slot_to', type: 'text', nullable: true })
  slotTo!: string | null;

  @Column({ name: 'pin_to', type: 'text', nullable: true })
  pinTo!: string | null;

  @Column({ name: 'driver_rate', type: 'text', nullable: true })
  driverRate!: string | null;

  @Column({ type: 'text', nullable: true })
  vat!: string | null;

  @Column({ name: 'client_rate', type: 'text', nullable: true })
  clientRate!: string | null;

  @Column({ type: 'text', nullable: true })
  passes!: string | null;

  @Column({ name: 'extra_address', type: 'text', nullable: true })
  extraAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  demurrage!: string | null;

  @Column({ name: 'order_on_vehicle', type: 'boolean', default: false })
  orderOnVehicle!: boolean;

  @Column({ name: 'invoice_sent', type: 'boolean', default: false })
  invoiceSent!: boolean;

  /** ЭЗЗ/ПЭ — электронная заявка на заезд / пропуск экспедитора (галочка, 23.09.2026) */
  @Column({ name: 'ezz_pe', type: 'boolean', default: false })
  ezzPe!: boolean;

  /** ЭТРН — электронная транспортная накладная (галочка, 23.09.2026) */
  @Column({ type: 'boolean', default: false })
  etrn!: boolean;

  @Column({ name: 'extra_ton', type: 'text', nullable: true })
  extraTon!: string | null;

  @Column({ type: 'text', nullable: true })
  seal!: string | null;

  @Column({ type: 'boolean', default: false })
  recoupling!: boolean;

  @Column({ name: 'driver_remarks', type: 'text', nullable: true })
  driverRemarks!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  /** «Ответственный» — фамилия и инициалы того, кто завёл заявку; не меняется (импорт — пусто). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  responsible!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
