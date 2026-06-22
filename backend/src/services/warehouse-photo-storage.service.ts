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

const backupRoot = process.env.WAREHOUSE_PHOTO_BACKUP_PATH
  ? path.resolve(process.env.WAREHOUSE_PHOTO_BACKUP_PATH)
  : null;

const resolveVehicleDirectory = (vehicleId: string): string =>
  path.join(storageRoot, vehicleId);

const resolveBackupVehicleDirectory = (vehicleId: string): string | null =>
  backupRoot ? path.join(backupRoot, vehicleId) : null;

const resolveStoredFile = (
  rootDirectory: string,
  vehicleId: string,
  storedName: string,
): string | null => {
  const directory = path.resolve(rootDirectory, vehicleId);
  const filePath = path.resolve(directory, path.basename(storedName));
  if (!filePath.startsWith(`${directory}${path.sep}`)) return null;
  return filePath;
};

export const isWarehousePhotoBackupEnabled = (): boolean => backupRoot !== null;

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
  const filePath = path.join(directory, storedName);
  await fs.writeFile(filePath, bytes, { flag: 'wx' });
  const backupDirectory = resolveBackupVehicleDirectory(vehicleId);
  if (backupDirectory) {
    try {
      await fs.mkdir(backupDirectory, { recursive: true });
      await fs.copyFile(filePath, path.join(backupDirectory, storedName));
    } catch (error) {
      await fs.unlink(filePath).catch(() => undefined);
      throw new Error(`Не удалось создать резервную копию фотографии: ${(error as Error).message}`);
    }
  }
  return storedName;
};

export const resolveWarehousePhotoPath = (
  vehicleId: string,
  storedName: string,
): string | null => {
  return resolveStoredFile(storageRoot, vehicleId, storedName);
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
  if (backupRoot) {
    const backupPath = resolveStoredFile(backupRoot, vehicleId, storedName);
    if (backupPath) {
      await fs.unlink(backupPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
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
  const backupDirectory = resolveBackupVehicleDirectory(vehicleId);
  if (backupDirectory) {
    await fs.rm(backupDirectory, { recursive: true, force: true });
  }
  return photos.length;
};
