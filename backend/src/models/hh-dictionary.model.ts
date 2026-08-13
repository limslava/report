import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('hh_dictionaries')
export class HhDictionary {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  key!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  etag!: string | null;

  @Column({ name: 'payload_json', type: 'jsonb' })
  payloadJson!: Record<string, unknown>;

  @UpdateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
