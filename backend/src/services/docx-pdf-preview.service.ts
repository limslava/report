import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function isDocxFile(fileName: string, mimeType?: string | null): boolean {
  return path.extname(fileName).toLowerCase() === '.docx'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

// Конвертирует DOCX в PDF для предпросмотра (кешируется рядом с исходным файлом).
export async function getDocxPdfPreviewPath(readablePath: string): Promise<string> {
  const cachedPreviewPath = `${readablePath}.preview.pdf`;
  try {
    await fs.access(cachedPreviewPath);
    return cachedPreviewPath;
  } catch {
    // ниже сформируем PDF и переиспользуем при следующих просмотрах
  }

  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-docx-preview-'));
  const libreOfficeBins = [process.env.LIBREOFFICE_BIN, 'libreoffice', 'soffice'].filter(Boolean) as string[];
  let converterNotFound = false;
  try {
    for (const bin of libreOfficeBins) {
      try {
        await execFileAsync(
          bin,
          ['--headless', '--convert-to', 'pdf', '--outdir', outputDirectory, readablePath],
          { timeout: 60_000, maxBuffer: 1024 * 1024 },
        );
        converterNotFound = false;
        break;
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          converterNotFound = true;
          continue;
        }
        throw error;
      }
    }
    if (converterNotFound) {
      const unavailable: any = new Error('Предпросмотр DOCX временно недоступен: на сервере не установлен конвертер документов');
      unavailable.statusCode = 503;
      throw unavailable;
    }
    const generatedFiles = await fs.readdir(outputDirectory);
    const generatedPdf = generatedFiles.find((fileName) => fileName.toLowerCase().endsWith('.pdf'));
    if (!generatedPdf) {
      const error: any = new Error('Не удалось сформировать PDF-просмотр документа DOCX');
      error.statusCode = 500;
      throw error;
    }
    await fs.copyFile(path.join(outputDirectory, generatedPdf), cachedPreviewPath);
    return cachedPreviewPath;
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}
