import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { NoteRecipient } from './note-recipient.model';
import { NoteRead } from './note-read.model';

export type NoteVisibility = 'private' | 'targeted' | 'broadcast';
export type NoteSource = 'manual' | 'system';
export type NoteStatus = 'active' | 'closed';

@Entity('notes')
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 400 })
  title!: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ name: 'author_name', type: 'varchar', length: 255 })
  authorName!: string;

  @Column({ type: 'varchar', length: 20 })
  visibility!: NoteVisibility;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source!: NoteSource;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: NoteStatus;

  @Column({ name: 'linked_contract_id', type: 'uuid', nullable: true })
  linkedContractId!: string | null;

  @Column({ name: 'linked_step_id', type: 'uuid', nullable: true })
  linkedStepId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => NoteRecipient, recipient => recipient.note, { cascade: true })
  recipients?: NoteRecipient[];

  @OneToMany(() => NoteRead, read => read.note, { cascade: true })
  reads?: NoteRead[];
}
