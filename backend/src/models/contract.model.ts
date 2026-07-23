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
import { ContractApprovalStep } from './contract-approval-step.model';
import { ContractTemplateVersion } from './contract-template-version.model';

export enum ContractType {
  EXPENSE = 'expense',
  INCOME = 'income',
}

export enum ContractDocumentKind {
  MASTER = 'master',
  ADDENDUM = 'addendum',
}

export enum ContractTemplateKind {
  TYPICAL = 'typical',
  NON_TYPICAL = 'non_typical',
}

export enum ContractIncomeSubtype {
  STANDARD = 'standard',
  WITH_PSR = 'with_psr',
}

// Вид доходного договора: ТЭУ (транспортно-экспедиционные услуги) или Агентский.
// Ортогонально ПСР (incomeSubtype). Для расходных — null.
export enum ContractIncomeKind {
  TEU = 'teu',
  AGENCY = 'agency',
}

export enum ContractSigningMethod {
  EDO = 'edo',
  POST = 'post',
}

export enum ContractStatus {
  DRAFT = 'draft',
  IN_APPROVAL = 'in_approval',
  REWORK = 'rework',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('contracts')
@Index('idx_contracts_number', ['contractNumber'])
@Index('idx_contracts_inn', ['counterpartyInn'])
@Index('idx_contracts_type', ['contractType'])
@Index('idx_contracts_parent', ['parentContractId'])
@Index('uq_contracts_initiator_client_req', ['initiatorId', 'clientRequestId'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_number', type: 'varchar', length: 100 })
  contractNumber!: string;

  @Column({ name: 'contract_type', type: 'enum', enum: ContractType })
  contractType!: ContractType;

  @Column({ name: 'income_subtype', type: 'enum', enum: ContractIncomeSubtype, nullable: true })
  incomeSubtype!: ContractIncomeSubtype | null;

  @Column({ name: 'income_kind', type: 'enum', enum: ContractIncomeKind, nullable: true })
  incomeKind!: ContractIncomeKind | null;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 255 })
  counterpartyName!: string;

  @Column({ name: 'counterparty_short_name', type: 'varchar', length: 255, nullable: true })
  counterpartyShortName!: string | null;

  @Column({ name: 'ownership_form', type: 'varchar', length: 100, nullable: true })
  ownershipForm!: string | null;

  @Column({ name: 'counterparty_form', type: 'varchar', length: 32, nullable: true })
  counterpartyForm!: string | null;

  @Column({ name: 'counterparty_inn', type: 'varchar', length: 12 })
  counterpartyInn!: string;

  @Column({ name: 'counterparty_ogrn', type: 'varchar', length: 15, nullable: true })
  counterpartyOgrn!: string | null;

  @Column({ name: 'counterparty_kpp', type: 'varchar', length: 9, nullable: true })
  counterpartyKpp!: string | null;

  @Column({ name: 'counterparty_legal_address', type: 'varchar', length: 500, nullable: true })
  counterpartyLegalAddress!: string | null;

  @Column({ name: 'counterparty_postal_address', type: 'varchar', length: 500, nullable: true })
  counterpartyPostalAddress!: string | null;

  @Column({ name: 'counterparty_phone', type: 'varchar', length: 100, nullable: true })
  counterpartyPhone!: string | null;

  @Column({ name: 'counterparty_email', type: 'varchar', length: 255, nullable: true })
  counterpartyEmail!: string | null;

  @Column({ name: 'counterparty_signer_position', type: 'varchar', length: 255, nullable: true })
  counterpartySignerPosition!: string | null;

  @Column({ name: 'counterparty_signer_name', type: 'varchar', length: 255, nullable: true })
  counterpartySignerName!: string | null;

  @Column({ name: 'counterparty_signer_name_genitive', type: 'varchar', length: 255, nullable: true })
  counterpartySignerNameGenitive!: string | null;

  @Column({ name: 'counterparty_signer_authority', type: 'varchar', length: 255, nullable: true })
  counterpartySignerAuthority!: string | null;

  @Column({ name: 'counterparty_bank_name', type: 'varchar', length: 255, nullable: true })
  counterpartyBankName!: string | null;

  @Column({ name: 'counterparty_bank_bik', type: 'varchar', length: 9, nullable: true })
  counterpartyBankBik!: string | null;

  @Column({ name: 'counterparty_bank_account', type: 'varchar', length: 20, nullable: true })
  counterpartyBankAccount!: string | null;

  @Column({ name: 'counterparty_correspondent_account', type: 'varchar', length: 20, nullable: true })
  counterpartyCorrespondentAccount!: string | null;

  @Column({ name: 'template_kind', type: 'enum', enum: ContractTemplateKind, default: ContractTemplateKind.TYPICAL })
  templateKind!: ContractTemplateKind;

  @Column({ name: 'template_version_id', type: 'uuid', nullable: true })
  templateVersionId!: string | null;

  @ManyToOne(() => ContractTemplateVersion, { nullable: true })
  @JoinColumn({ name: 'template_version_id' })
  templateVersion!: ContractTemplateVersion | null;

  @Column({ name: 'subject', type: 'varchar', length: 500, nullable: true })
  subject!: string | null;

  @Column({ name: 'contract_date', type: 'date', nullable: true })
  contractDate!: Date | null;

  @Column({ name: 'psr_flag', type: 'boolean', default: false })
  psrFlag!: boolean;

  @Column({ name: 'signing_method', type: 'enum', enum: ContractSigningMethod, default: ContractSigningMethod.POST })
  signingMethod!: ContractSigningMethod;

  @Column({ name: 'status', type: 'enum', enum: ContractStatus, default: ContractStatus.DRAFT })
  status!: ContractStatus;

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

  @Column({ name: 'client_request_id', type: 'varchar', length: 64, nullable: true })
  clientRequestId!: string | null;

  @Column({ name: 'assigned_general_director_id', type: 'uuid', nullable: true })
  assignedGeneralDirectorId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_general_director_id' })
  assignedGeneralDirector!: User | null;

  @OneToMany(() => ContractApprovalStep, (step) => step.contract)
  approvalSteps!: ContractApprovalStep[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
