const MAX_IMAGE_SIDE = 1920;
const JPEG_QUALITY = 0.82;

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
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает обработку фотографий');
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error(`Не удалось сжать ${file.name}`)),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'photo';
  return { blob, name: `${baseName}.jpg` };
};
