import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ContractIncomeSubtype, ContractType } from './contract.model';

@Entity('contract_sla_rules')
@Index('idx_contract_sla_rule_unique', ['contractType', 'incomeSubtype', 'roleCode'], { unique: true })
export class ContractSlaRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_type', type: 'enum', enum: ContractType })
  contractType!: ContractType;

  @Column({ name: 'income_subtype', type: 'enum', enum: ContractIncomeSubtype, nullable: true })
  incomeSubtype!: ContractIncomeSubtype | null;

  @Column({ name: 'role_code', type: 'varchar', length: 64 })
  roleCode!: string;

  @Column({ name: 'sla_workdays', type: 'int', default: 1 })
  slaWorkdays!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
