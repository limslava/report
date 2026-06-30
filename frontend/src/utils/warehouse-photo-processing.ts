const MAX_IMAGE_SIDE = 1920;
const JPEG_QUALITY = 0.82;
const MAX_WAREHOUSE_PHOTO_BYTES = 12 * 1024 * 1024;

const ALLOWED_ORIGINAL_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const getFileExtension = (name: string): string => (
  name.split('.').pop()?.trim().toLowerCase() || ''
);

const getSafeMimeType = (file: File): string => {
  const declaredType = file.type.trim().toLowerCase();
  if (declaredType) return declaredType;
  return MIME_BY_EXTENSION[getFileExtension(file.name)] || '';
};

const getSafeOriginalName = (file: File, mimeType: string): string => {
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'photo';
  const extension = getFileExtension(file.name);
  if (extension) return file.name;
  if (mimeType === 'image/png') return `${baseName}.png`;
  if (mimeType === 'image/webp') return `${baseName}.webp`;
  return `${baseName}.jpg`;
};

const shouldUploadOriginal = (file: File): boolean => (
  file.size > 0
  && file.size <= MAX_WAREHOUSE_PHOTO_BYTES
  && ALLOWED_ORIGINAL_MIME_TYPES.has(getSafeMimeType(file))
);

const prepareOriginalPhoto = (file: File): { blob: Blob; name: string } => {
  const mimeType = getSafeMimeType(file);
  if (!shouldUploadOriginal(file)) {
    if (file.size > MAX_WAREHOUSE_PHOTO_BYTES) {
      throw new Error(`Файл ${file.name} больше 12 МБ и не может быть загружен без сжатия.`);
    }
    throw new Error(`Не удалось подготовить ${file.name}. Поддерживаются JPEG, PNG и WebP.`);
  }

  const blob = file.type
    ? file
    : new Blob([file], { type: mimeType });
  return {
    blob,
    name: getSafeOriginalName(file, mimeType),
  };
};

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error(`Не удалось прочитать ${file.name}`));
  };
  image.src = url;
});

export const prepareWarehousePhoto = async (
  file: File,
): Promise<{ blob: Blob; name: string }> => {
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return prepareOriginalPhoto(file);
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает обработку фотографий');
  context.drawImage(image, 0, 0, width, height);
  let blob: Blob;
  try {
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error(`Не удалось сжать ${file.name}`)),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  } catch {
    return prepareOriginalPhoto(file);
  }
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'photo';
  return { blob, name: `${baseName}.jpg` };
};
