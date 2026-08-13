import fs from 'fs/promises';
import convert from 'heic-convert';

/**
 * Предпросмотр HEIC-изображений (фото iPhone, часто переименованные в .jpg):
 * браузеры HEIC не отображают, поэтому для показа конвертируем в JPEG.
 * Формат определяется по содержимому файла, а не по расширению.
 * Результат кешируется рядом с исходным файлом (как PDF-предпросмотр DOCX).
 */

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

export function looksLikeHeic(data: Buffer): boolean {
  if (data.length < 12) return false;
  if (data.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
  const brand = data.subarray(8, 12).toString('ascii').toLowerCase();
  return HEIC_BRANDS.includes(brand);
}

export async function getHeicJpegPreview(storagePath: string, data: Buffer): Promise<Buffer> {
  const cachedPreviewPath = `${storagePath}.preview.jpg`;
  try {
    return await fs.readFile(cachedPreviewPath);
  } catch {
    // кеша ещё нет — конвертируем ниже
  }

  const jpeg = Buffer.from(await convert({ buffer: data, format: 'JPEG', quality: 0.85 }));
  try {
    await fs.writeFile(cachedPreviewPath, jpeg);
  } catch {
    // не удалось записать кеш — не страшно, отдадим результат без кеширования
  }
  return jpeg;
}
