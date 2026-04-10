import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Note } from './note.model';

@Entity('note_reads')
export class NoteRead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'note_id', type: 'uuid' })
  noteId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'read_at' })
  readAt!: Date;

  @ManyToOne(() => Note, note => note.reads, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note!: Note;
}
