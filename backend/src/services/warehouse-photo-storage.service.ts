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

const backupRoot = path.resolve(
  process.env.WAREHOUSE_PHOTO_BACKUP_PATH
    || path.join(process.cwd(), 'backups', 'warehouse-photos'),
);

const resolveVehicleDirectory = (vehicleId: string): string =>
  path.join(storageRoot, vehicleId);

const resolvePendingDirectory = (uploadSessionId: string): string =>
  path.join(storageRoot, '_pending', uploadSessionId);

const resolveBackupVehicleDirectory = (vehicleId: string): string =>
  path.join(backupRoot, vehicleId);

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

export const isWarehousePhotoBackupEnabled = (): boolean => true;

export const ensureWarehousePhotoStorageReady = async (): Promise<void> => {
  if (storageRoot === backupRoot) {
    throw new Error('Основное хранилище и резервная копия фотографий должны находиться в разных каталогах');
  }
  await Promise.all([
    fs.mkdir(storageRoot, { recursive: true }),
    fs.mkdir(backupRoot, { recursive: true }),
  ]);
  await Promise.all([
    fs.access(storageRoot),
    fs.access(backupRoot),
  ]);
};

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
  try {
    await fs.mkdir(backupDirectory, { recursive: true });
    await fs.copyFile(filePath, path.join(backupDirectory, storedName));
  } catch (error) {
    await fs.unlink(filePath).catch(() => undefined);
    throw new Error(`Не удалось создать резервную копию фотографии: ${(error as Error).message}`);
  }
  return storedName;
};

export const storeWarehousePendingPhoto = async (
  uploadSessionId: string,
  mimeType: string,
  bytes: Buffer,
): Promise<string> => {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error('Unsupported warehouse photo type');
  const directory = resolvePendingDirectory(uploadSessionId);
  await fs.mkdir(directory, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extension}`;
  await fs.writeFile(path.join(directory, storedName), bytes, { flag: 'wx' });
  return storedName;
};

export const moveWarehouseTusTempToPending = async (
  uploadSessionId: string,
  mimeType: string,
  tempFilePath: string,
  clientHash?: string | null,
): Promise<string> => {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error('Unsupported warehouse photo type');
  const directory = resolvePendingDirectory(uploadSessionId);
  await fs.mkdir(directory, { recursive: true });
  const normalizedHash = String(clientHash ?? '').trim().replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 80);
  const storedName = normalizedHash
    ? `${Date.now()}-${normalizedHash}-${crypto.randomBytes(16).toString('hex')}${extension}`
    : `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extension}`;
  await fs.rename(tempFilePath, path.join(directory, storedName));
  return storedName;
};

export const attachWarehousePendingPhotoFile = async (
  uploadSessionId: string,
  vehicleId: string,
  storedName: string,
): Promise<string> => {
  const pendingDirectory = path.resolve(resolvePendingDirectory(uploadSessionId));
  const sourcePath = path.resolve(pendingDirectory, path.basename(storedName));
  if (!sourcePath.startsWith(`${pendingDirectory}${path.sep}`)) {
    throw new Error('Invalid pending photo path');
  }
  const targetDirectory = resolveVehicleDirectory(vehicleId);
  await fs.mkdir(targetDirectory, { recursive: true });
  const targetName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${path.extname(storedName)}`;
  const targetPath = path.join(targetDirectory, targetName);
  await fs.rename(sourcePath, targetPath);
  const backupDirectory = resolveBackupVehicleDirectory(vehicleId);
  try {
    await fs.mkdir(backupDirectory, { recursive: true });
    await fs.copyFile(targetPath, path.join(backupDirectory, targetName));
  } catch (error) {
    await fs.unlink(targetPath).catch(() => undefined);
    throw new Error(`Не удалось создать резервную копию фотографии: ${(error as Error).message}`);
  }
  return targetName;
};

export const deleteWarehousePendingPhotoFile = async (
  uploadSessionId: string,
  storedName: string,
): Promise<void> => {
  const pendingDirectory = path.resolve(resolvePendingDirectory(uploadSessionId));
  const filePath = path.resolve(pendingDirectory, path.basename(storedName));
  if (!filePath.startsWith(`${pendingDirectory}${path.sep}`)) return;
  await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
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
  const backupPath = resolveStoredFile(backupRoot, vehicleId, storedName);
  if (backupPath) {
    await fs.unlink(backupPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
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
  await fs.rm(backupDirectory, { recursive: true, force: true });
  return photos.length;
};
