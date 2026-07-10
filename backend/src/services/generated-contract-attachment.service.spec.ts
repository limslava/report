import { Contract } from '../models/contract.model';
import { replaceGeneratedContractAttachment } from './generated-contract-attachment.service';

describe('generated contract attachment replacement', () => {
  it('replaces previous generated file and persists exactly one new attachment', async () => {
    const contract = Object.assign(new Contract(), { id: 'contract-1' });
    const previousGenerated = { originalName: 'Сформированный_доходный_договор_SW-2026-0001.docx', path: '/tmp/generated.docx' };
    const manualAttachment = { originalName: 'scan.pdf', path: '/tmp/scan.pdf' };
    const removeFile = jest.fn(async () => undefined);
    const removeAttachment = jest.fn(async () => undefined);
    const persistAttachment = jest.fn(async () => undefined);

    const replaced = await replaceGeneratedContractAttachment({
      contract,
      uploadedByUserId: 'user-1',
      dependencies: {
        generateDocument: jest.fn(async () => ({
          name: 'Сформированный_доходный_договор_SW-2026-0002.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: Buffer.from('docx'),
        })),
        isGeneratedFileName: (fileName) => fileName.startsWith('Сформированный_доходный_договор_'),
        findExistingAttachments: jest.fn(async () => [previousGenerated, manualAttachment]),
        resolveAttachmentPath: jest.fn(async (attachment) => attachment.path),
        removeFile,
        removeAttachment,
        persistAttachment,
      },
    });

    expect(replaced).toBe(true);
    expect(removeAttachment).toHaveBeenCalledTimes(1);
    expect(removeAttachment).toHaveBeenCalledWith(previousGenerated);
    expect(removeFile).toHaveBeenCalledWith('/tmp/generated.docx');
    expect(removeFile).toHaveBeenCalledWith('/tmp/generated.docx.preview.pdf');
    expect(persistAttachment).toHaveBeenCalledTimes(1);
    expect(persistAttachment).toHaveBeenCalledWith({
      contractId: 'contract-1',
      uploadedByUserId: 'user-1',
      file: {
        name: 'Сформированный_доходный_договор_SW-2026-0002.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 4,
        contentBase64: Buffer.from('docx').toString('base64'),
      },
    });
  });
});
