import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { AppDataSource } from '../config/data-source';
import { WarehousePhoto } from '../models/warehouse-photo.model';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const MAX_WAREHOUSE_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_WAREHOUSE_PHOTOS_PER_VEHICLE = 60;

const storageRoot = path.resolve(
  process.env.WAREHOUSE_UPLOAD_PATH || path.join(process.cwd(), 'uploads', 'warehouse'),
);

const resolveVehicleDirectory = (vehicleId: string): string =>
  path.join(storageRoot, vehicleId);

export const isAllowedWarehousePhotoMime = (mimeType: string): boolean =>
  Boolean(MIME_EXTENSIONS[mimeType]);

export const storeWarehousePhoto = async (
  vehicleId: string,
  mimeType: string,
  bytes: Buffer,
): Promise<string> => {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error('Unsupported warehouse photo type');
  const directory = resolveVehicleDirectory(vehicleId);
  await fs.mkdir(directory, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extension}`;
  await fs.writeFile(path.join(directory, storedName), bytes, { flag: 'wx' });
  return storedName;
};

export const resolveWarehousePhotoPath = (
  vehicleId: string,
  storedName: string,
): string | null => {
  const directory = path.resolve(resolveVehicleDirectory(vehicleId));
  const filePath = path.resolve(directory, path.basename(storedName));
  if (!filePath.startsWith(`${directory}${path.sep}`)) return null;
  return filePath;
};

export const deleteWarehousePhotoFile = async (
  vehicleId: string,
  storedName: string,
): Promise<void> => {
  const filePath = resolveWarehousePhotoPath(vehicleId, storedName);
  if (!filePath) return;
  await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
};

export const purgeWarehouseVehiclePhotos = async (
  vehicleId: string,
): Promise<number> => {
  const repository = AppDataSource.getRepository(WarehousePhoto);
  const photos = await repository.find({ where: { vehicleId } });
  await Promise.all(photos.map((photo) => deleteWarehousePhotoFile(vehicleId, photo.storedName)));
  if (photos.length > 0) {
    await repository.delete({ vehicleId });
  }
  await fs.rm(resolveVehicleDirectory(vehicleId), { recursive: true, force: true });
  return photos.length;
};
