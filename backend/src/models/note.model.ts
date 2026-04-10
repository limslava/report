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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => NoteRecipient, recipient => recipient.note, { cascade: true })
  recipients?: NoteRecipient[];

  @OneToMany(() => NoteRead, read => read.note, { cascade: true })
  reads?: NoteRead[];
}
