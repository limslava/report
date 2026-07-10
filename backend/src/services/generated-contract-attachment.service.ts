import { Contract } from '../models/contract.model';

export type GeneratedContractAttachment = {
  name: string;
  mimeType: string;
  buffer: Buffer;
  templateVersionId?: string | null;
};

export type ExistingGeneratedAttachment = {
  originalName: string;
};

export type ReplaceGeneratedContractAttachmentDependencies<TAttachment extends ExistingGeneratedAttachment> = {
  generateDocument: (contract: Contract) => Promise<GeneratedContractAttachment | null>;
  isGeneratedFileName: (fileName: string) => boolean;
  findExistingAttachments: (contractId: string) => Promise<TAttachment[]>;
  resolveAttachmentPath: (attachment: TAttachment) => Promise<string | null>;
  removeFile: (path: string) => Promise<void>;
  removeAttachment: (attachment: TAttachment) => Promise<void>;
  persistAttachment: (params: {
    contractId: string;
    uploadedByUserId?: string | null;
    file: {
      name: string;
      mimeType: string;
      size: number;
      contentBase64: string;
    };
  }) => Promise<void>;
};

export async function replaceGeneratedContractAttachment<TAttachment extends ExistingGeneratedAttachment>(params: {
  contract: Contract;
  uploadedByUserId?: string | null;
  dependencies: ReplaceGeneratedContractAttachmentDependencies<TAttachment>;
}): Promise<boolean> {
  const generated = await params.dependencies.generateDocument(params.contract);
  if (!generated) return false;
  params.contract.templateVersionId = generated.templateVersionId ?? null;

  const existing = await params.dependencies.findExistingAttachments(params.contract.id);
  for (const attachment of existing) {
    if (!params.dependencies.isGeneratedFileName(attachment.originalName)) continue;
    const readablePath = await params.dependencies.resolveAttachmentPath(attachment);
    if (readablePath) {
      await params.dependencies.removeFile(readablePath);
      await params.dependencies.removeFile(`${readablePath}.preview.pdf`);
    }
    await params.dependencies.removeAttachment(attachment);
  }

  await params.dependencies.persistAttachment({
    contractId: params.contract.id,
    uploadedByUserId: params.uploadedByUserId,
    file: {
      name: generated.name,
      mimeType: generated.mimeType,
      size: generated.buffer.length,
      contentBase64: generated.buffer.toString('base64'),
    },
  });
  return true;
}
