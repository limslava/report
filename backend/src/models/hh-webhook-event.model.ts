import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { HhWebhookEventStatus } from '../constants/hh';
import { HhConnection } from './hh-connection.model';

@Entity('hh_webhook_events')
@Index('idx_hh_webhook_events_connection_status', ['connectionId', 'status'])
@Index('idx_hh_webhook_events_action_type', ['actionType'])
export class HhWebhookEvent {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ name: 'connection_id', type: 'uuid', nullable: true })
  connectionId!: string | null;

  @ManyToOne(() => HhConnection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connection_id' })
  connection!: HhConnection | null;

  @Column({ name: 'subscription_id', type: 'varchar', length: 128, nullable: true })
  subscriptionId!: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 100 })
  actionType!: string;

  @Column({ name: 'payload_json', type: 'jsonb' })
  payloadJson!: Record<string, unknown>;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt!: Date;

  @Column({ type: 'varchar', length: 32, default: 'received' })
  status!: HhWebhookEventStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
