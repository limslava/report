import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.model';

export enum ContractType {
  EXPENSE = 'expense',
  INCOME = 'income',
}

export enum ContractDocumentKind {
  MASTER = 'master',
  ADDENDUM = 'addendum',
}

@Entity('contracts')
@Index('idx_contracts_number', ['contractNumber'])
@Index('idx_contracts_inn', ['counterpartyInn'])
@Index('idx_contracts_type', ['contractType'])
@Index('idx_contracts_parent', ['parentContractId'])
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_number', type: 'varchar', length: 100 })
  contractNumber!: string;

  @Column({ name: 'contract_type', type: 'enum', enum: ContractType })
  contractType!: ContractType;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 255 })
  counterpartyName!: string;

  @Column({ name: 'counterparty_short_name', type: 'varchar', length: 255, nullable: true })
  counterpartyShortName!: string | null;

  @Column({ name: 'ownership_form', type: 'varchar', length: 100, nullable: true })
  ownershipForm!: string | null;

  @Column({ name: 'counterparty_inn', type: 'varchar', length: 12 })
  counterpartyInn!: string;

  @Column({ name: 'document_kind', type: 'enum', enum: ContractDocumentKind, default: ContractDocumentKind.MASTER })
  documentKind!: ContractDocumentKind;

  @Column({ name: 'parent_contract_id', type: 'uuid', nullable: true })
  parentContractId!: string | null;

  @ManyToOne(() => Contract, (contract) => contract.addendums, { nullable: true })
  @JoinColumn({ name: 'parent_contract_id' })
  parentContract!: Contract | null;

  @OneToMany(() => Contract, (contract) => contract.parentContract)
  addendums!: Contract[];

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'initiator_id' })
  initiator!: User;

  @Column({ name: 'initiator_id', type: 'uuid' })
  initiatorId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
