export type CounterpartyFormRef = {
  code: 'ooo' | 'ao' | 'pao' | 'zao' | 'ip';
  label: string;
  innLength: 10 | 12;
  isIndividual: boolean;
};

export type ContractRecord = {
  id: string;
  contractNumber: string;
  documentKind: 'master' | 'addendum';
  parentContractId: string | null;
  parentContractNumber?: string | null;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  counterpartyShortName: string | null;
  counterpartyForm: CounterpartyFormRef['code'] | null;
  counterpartyInn: string;
  counterpartyOgrn?: string | null;
  counterpartyKpp?: string | null;
  counterpartyLegalAddress?: string | null;
  counterpartyPostalAddress?: string | null;
  counterpartyPhone?: string | null;
  counterpartyEmail?: string | null;
  counterpartySignerPosition?: string | null;
  counterpartySignerName?: string | null;
  counterpartySignerNameGenitive?: string | null;
  counterpartySignerAuthority?: string | null;
  counterpartyBankName?: string | null;
  counterpartyBankBik?: string | null;
  counterpartyBankAccount?: string | null;
  counterpartyCorrespondentAccount?: string | null;
  subject: string | null;
  contractDate: string | null;
  psrFlag: boolean;
  signingMethod: 'edo' | 'post';
  status: 'draft' | 'in_approval' | 'rework' | 'approved' | 'rejected';
  currentStageRole?: string | null;
  currentStageLabel?: string | null;
  statusDetail?: string | null;
  needsSignedAttachment?: boolean;
  signedFile?: { id: string; originalName: string; mimeType: string | null } | null;
  initiator?: { id: string; fullName: string; role: string } | null;
};

export type DuplicateContract = {
  id: string;
  contractNumber: string;
  contractDate: string | null;
  subject: string | null;
  status: ContractRecord['status'];
};

export type ContractWizardPrefill = {
  resolvedInn?: string;
  counterpartyName?: string;
  counterpartyShortName?: string;
  counterpartyForm?: CounterpartyFormRef['code'];
  counterpartyOgrn?: string | null;
  counterpartyKpp?: string | null;
  counterpartyLegalAddress?: string | null;
  counterpartySignerName?: string | null;
};

export type ContractWizardForm = {
  clientRequestId: string;
  documentKind: 'master' | 'addendum';
  parentContractId: string;
  counterpartyInn: string;
  counterpartyName: string;
  counterpartyShortName: string;
  counterpartyForm: CounterpartyFormRef['code'] | '';
  contractType: 'expense' | 'income';
  psrMode: 'with_psr' | 'without_psr';
  contractNumber: string;
  subject: string;
  contractDate: string;
  signingMethod: 'edo' | 'post';
  counterpartyOgrn: string;
  counterpartyKpp: string;
  counterpartyLegalAddress: string;
  counterpartyPostalAddress: string;
  counterpartyPhone: string;
  counterpartyEmail: string;
  counterpartySignerPosition: string;
  counterpartySignerName: string;
  counterpartySignerNameGenitive: string;
  counterpartySignerAuthority: string;
  counterpartyBankName: string;
  counterpartyBankBik: string;
  counterpartyBankAccount: string;
  counterpartyCorrespondentAccount: string;
};

export type SecurityVisaValue = '' | 'approved' | 'rejected' | 'approved_with_remarks';
export type ApprovalDecisionValue = '' | 'approved' | 'rejected' | 'approved_with_remarks';
export type InboxView = 'active' | 'processed' | 'all' | 'new' | 'due_today' | 'overdue' | 'completed_month';
export type ContractSection = 'inbox' | 'mine' | 'registry';

export type ContractAttachmentRef = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt?: string;
  uploadedByUserId?: string | null;
  context?: 'contract' | 'approval_step';
  revisionNo?: number;
};

export type ContractDiscussionAttachmentRef = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt?: string;
  uploadedByUserId?: string | null;
};

export type ContractDiscussionMessage = {
  id: string;
  contractId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
  updatedAt: string;
  author: {
    id: string | null;
    fullName: string;
    role: string | null;
  };
  attachments: ContractDiscussionAttachmentRef[];
};

export type UserDirectoryItem = {
  id: string;
  fullName: string;
  role: string;
};

export type SheetStep = {
  id: string;
  roleCode: string;
  roleLabel: string;
  approverUserId: string;
  approverName: string;
  orderNo: number;
  revisionNo?: number;
  acceptedAt: string | null;
  signedAt: string | null;
  assignedAt?: string | null;
  deadlineAt?: string | null;
  decision: 'approve' | 'rework' | 'reject' | null;
  comment: string | null;
  attachments: ContractAttachmentRef[];
};

export type ApprovalRevision = {
  revisionNo: number;
  attachments: ContractAttachmentRef[];
  steps: SheetStep[];
};

export type ApprovalSheet = {
  contract: {
    id: string;
    contractNumber: string;
    documentKind: 'master' | 'addendum';
    parentContractId: string | null;
    parentContractNumber?: string | null;
    contractType: 'expense' | 'income';
    incomeSubtype: 'standard' | 'with_psr' | null;
    counterpartyName: string;
    counterpartyShortName: string | null;
    counterpartyInn: string;
    counterpartyOgrn?: string | null;
    counterpartyKpp?: string | null;
    counterpartyLegalAddress?: string | null;
    counterpartyPostalAddress?: string | null;
    counterpartyPhone?: string | null;
    counterpartyEmail?: string | null;
    counterpartySignerPosition?: string | null;
    counterpartySignerName?: string | null;
    counterpartySignerAuthority?: string | null;
    counterpartyBankName?: string | null;
    counterpartyBankBik?: string | null;
    counterpartyBankAccount?: string | null;
    counterpartyCorrespondentAccount?: string | null;
    subject: string | null;
    contractDate: string | null;
    psrFlag: boolean;
    signingMethod: 'edo' | 'post';
    status: 'draft' | 'in_approval' | 'rework' | 'approved' | 'rejected';
    revisionNo?: number;
    attachments: ContractAttachmentRef[];
    initiator: { id: string; fullName: string } | null;
    assignedGeneralDirector: { id: string; fullName: string } | null;
  };
  currentStepId: string | null;
  steps: SheetStep[];
  previousRevisions?: ApprovalRevision[];
};

export type DecisionHistoryEvent = {
  id: string;
  roleCode: string;
  roleLabel: string;
  revisionNo: number;
  actorName: string;
  previousDecision: 'approve' | 'rework' | 'reject' | null;
  newDecision: 'approve' | 'rework' | 'reject';
  previousComment: string | null;
  newComment: string | null;
  createdAt: string;
};

export type SecurityInboxItem = {
  contractId: string;
  stepId: string;
  contractNumber: string;
  counterpartyShortName: string | null;
  counterpartyForm: CounterpartyFormRef['code'] | null;
  counterpartyInn: string;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  subject: string | null;
  contractDate: string | null;
  initiatorName: string;
  assignedAt: string | null;
  deadlineAt: string | null;
  securityDecision: 'approve' | 'rework' | 'reject' | null;
  securitySignedAt: string | null;
  securityComment?: string | null;
  attachments: ContractAttachmentRef[];
};

export type ApprovalInboxItem = {
  contractId: string;
  stepId: string;
  contractNumber: string;
  counterpartyShortName: string | null;
  counterpartyInn: string;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  subject: string | null;
  contractDate: string | null;
  signingMethod: 'edo' | 'post';
  initiatorName: string;
  assignedAt: string | null;
  deadlineAt: string | null;
  stepDecision: 'approve' | 'rework' | 'reject' | null;
  stepSignedAt: string | null;
  stepComment: string | null;
  roleCode: string;
  roleLabel: string;
  attachments: ContractAttachmentRef[];
};
