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

const loadImage = (source: Blob, name = 'файл'): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(source);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error(`Не удалось прочитать ${name}`));
  };
  image.src = url;
});

const THUMBNAIL_MAX_SIDE = 320;
const THUMBNAIL_JPEG_QUALITY = 0.7;

// Маленькое превью (data URL) для списков: держать в памяти/состоянии полноразмерные
// base64-фото нельзя — на телефоне десятки таких превью убивают вкладку.
export const createWarehousePhotoThumbnail = async (source: Blob): Promise<string | null> => {
  try {
    const image = await loadImage(source);
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY);
  } catch {
    return null;
  }
};

// Целевой размер файла после сжатия: на канале 2 Мбит/с каждое фото >1 МБ —
// это лишние секунды загрузки и лишние обрывы. Дожимаем итеративно: сначала
// качеством (до 0.5), затем стороной (минус 20% за шаг, но не ниже 900 px).
const TARGET_PHOTO_BYTES = 1 * 1024 * 1024;
const MIN_JPEG_QUALITY = 0.5;
const MIN_IMAGE_SIDE = 900;
const MAX_COMPRESS_ITERATIONS = 7;

type DrawableImage = HTMLImageElement | ImageBitmap;

const imageSizeOf = (image: DrawableImage): { width: number; height: number } => (
  'naturalWidth' in image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }
);

// createImageBitmap декодирует быстрее и экономнее по памяти, чем <img>,
// но есть не во всех браузерах — при неудаче откатываемся на loadImage.
const decodeImage = async (file: File): Promise<DrawableImage> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // не смог — пробуем через <img>
    }
  }
  return loadImage(file, file.name);
};

const releaseImage = (image: DrawableImage): void => {
  if ('close' in image) {
    try {
      image.close();
    } catch {
      // ImageBitmap уже закрыт — не страшно
    }
  }
};

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number, name: string): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error(`Не удалось сжать ${name}`))),
      'image/jpeg',
      quality,
    );
  });

export const prepareWarehousePhoto = async (
  file: File,
): Promise<{ blob: Blob; name: string }> => {
  let image: DrawableImage;
  try {
    image = await decodeImage(file);
  } catch {
    return prepareOriginalPhoto(file);
  }
  try {
    const { width: sourceWidth, height: sourceHeight } = imageSizeOf(image);
    let maxSide = Math.min(MAX_IMAGE_SIDE, Math.max(sourceWidth, sourceHeight));
    let quality = JPEG_QUALITY;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает обработку фотографий');

    const renderAt = (side: number): void => {
      const scale = Math.min(1, side / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };

    renderAt(maxSide);
    let blob = await canvasToJpeg(canvas, quality, file.name);
    for (let iteration = 0; iteration < MAX_COMPRESS_ITERATIONS && blob.size > TARGET_PHOTO_BYTES; iteration += 1) {
      if (quality > MIN_JPEG_QUALITY) {
        quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1);
      } else if (maxSide > MIN_IMAGE_SIDE) {
        maxSide = Math.max(MIN_IMAGE_SIDE, Math.round(maxSide * 0.8));
        renderAt(maxSide);
      } else {
        break;
      }
      blob = await canvasToJpeg(canvas, quality, file.name);
    }
    const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'photo';
    return { blob, name: `${baseName}.jpg` };
  } catch {
    return prepareOriginalPhoto(file);
  } finally {
    releaseImage(image);
  }
};
