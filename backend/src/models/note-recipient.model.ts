import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Note } from './note.model';

@Entity('note_recipients')
export class NoteRecipient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'note_id', type: 'uuid' })
  noteId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'role_id', type: 'varchar', length: 50, nullable: true })
  roleId!: string | null;

  @ManyToOne(() => Note, note => note.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note!: Note;
}
