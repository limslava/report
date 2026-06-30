import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { WarehousePendingPhotoUpload } from '../models/warehouse-pending-photo-upload.model';
import { LessThan } from 'typeorm';
import jwt from 'jsonwebtoken';
import {
  deleteWarehousePendingPhotoFile,
  isAllowedWarehousePhotoMime,
  MAX_WAREHOUSE_PHOTO_BYTES,
  moveWarehouseTusTempToPending,
} from './warehouse-photo-storage.service';
import { logger } from '../utils/logger';
import { getJwtSecret } from '../config/env';

const TUS_PATH = '/api/warehouse/uploads';
const TUS_TEMP_DIR = path.resolve(
  process.env.WAREHOUSE_TUS_TEMP_PATH
    || path.join(process.cwd(), 'uploads', 'warehouse', '_tus'),
);
const TUS_CLEANUP_MAX_AGE_HOURS = Number(process.env.WAREHOUSE_TUS_CLEANUP_MAX_AGE_HOURS || 24);
const TUS_CLEANUP_INTERVAL_HOURS = Number(process.env.WAREHOUSE_TUS_CLEANUP_INTERVAL_HOURS || 1);
const PENDING_UPLOAD_TTL_HOURS = Number(process.env.WAREHOUSE_PENDING_UPLOAD_TTL_HOURS || 24);
const WAREHOUSE_TUS_ROLES = new Set<User['role']>(['admin', 'warehouse_manager', 'warehouse_keeper']);

let cleanupStarted = false;
const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>;

const isInfoFile = (filename: string) => filename.endsWith('.info');
const getTusUploadBaseId = (filename: string) => (
  isInfoFile(filename) ? filename.replace(/\.info$/, '') : filename
);

const cleanupTusUploadFiles = async (uploadId: string) => {
  await Promise.all([
    fs.promises.unlink(path.join(TUS_TEMP_DIR, uploadId)).catch(() => undefined),
    fs.promises.unlink(path.join(TUS_TEMP_DIR, `${uploadId}.json`)).catch(() => undefined),
    fs.promises.unlink(path.join(TUS_TEMP_DIR, `${uploadId}.info`)).catch(() => undefined),
  ]);
};

const ensureTusDirectory = () => {
  if (!fs.existsSync(TUS_TEMP_DIR)) {
    fs.mkdirSync(TUS_TEMP_DIR, { recursive: true });
  }
};

const cleanupTusTemp = async () => {
  try {
    const files = await fs.promises.readdir(TUS_TEMP_DIR);
    const now = Date.now();
    const maxAgeMs = TUS_CLEANUP_MAX_AGE_HOURS * 60 * 60 * 1000;

    for (const filename of files) {
      const filePath = path.join(TUS_TEMP_DIR, filename);
      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(filePath);
      } catch {
        continue;
      }
      if (!stats.isFile() || now - stats.mtimeMs < maxAgeMs) continue;

      const baseId = getTusUploadBaseId(filename);
      const infoPath = path.join(TUS_TEMP_DIR, `${baseId}.info`);
      const dataPath = path.join(TUS_TEMP_DIR, baseId);
      await Promise.all([
        fs.promises.unlink(infoPath).catch(() => undefined),
        fs.promises.unlink(dataPath).catch(() => undefined),
      ]);
    }
  } catch (error) {
    logger.warn('Warehouse TUS cleanup failed', { error: (error as Error).message });
  }
};

const cleanupExpiredPendingUploads = async () => {
  try {
    const repository = AppDataSource.getRepository(WarehousePendingPhotoUpload);
    const expired = await repository.find({
      where: { expiresAt: LessThan(new Date()) },
      take: 500,
    });

    if (expired.length === 0) return;

    for (const item of expired) {
      await deleteWarehousePendingPhotoFile(item.uploadSessionId, item.storedName).catch(() => undefined);
    }

    await repository.delete(expired.map((item) => item.id));
  } catch (error) {
    logger.warn('Warehouse pending upload cleanup failed', { error: (error as Error).message });
  }
};

const scheduleTusCleanup = () => {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const intervalMs = TUS_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

  const run = () => {
    void cleanupTusTemp();
    void cleanupExpiredPendingUploads();
  };

  run();
  setInterval(run, intervalMs);
};

const normalizeMetadataValue = (value: unknown, maxLength: number): string => (
  String(value ?? '').trim().slice(0, maxLength)
);

const getMetadataClientHash = (metadata: Record<string, unknown>): string => (
  String(metadata.clientHash ?? metadata.clienthash ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, '')
    .slice(0, 80)
);

const getUploadMimeType = (metadata: Record<string, unknown>): string => (
  String(metadata.filetype ?? metadata.fileType ?? '').trim().toLowerCase()
);

const getUploadPhase = (metadata: Record<string, unknown>): 'reception' | 'issue' => (
  metadata.phase === 'issue' ? 'issue' : 'reception'
);

const getChecklistItem = (metadata: Record<string, unknown>): string | null => {
  const value = normalizeMetadataValue(metadata.checklistItem ?? metadata.checklistitem, 64);
  return value || null;
};

const getMetadataUser = (metadata: Record<string, unknown>): Pick<User, 'id' | 'fullName' | 'role'> | null => {
  const id = normalizeMetadataValue(metadata.uploadedById ?? metadata.uploadedbyid, 64);
  const fullName = normalizeMetadataValue(metadata.uploadedByName ?? metadata.uploadedbyname, 255);
  const role = normalizeMetadataValue(metadata.uploadedByRole ?? metadata.uploadedbyrole, 64) as User['role'];
  if (!id || !fullName || !role) return null;
  return { id, fullName, role };
};

const getBearerToken = (headers: Record<string, unknown> | undefined): string | null => {
  const authHeader = String(headers?.authorization ?? headers?.Authorization ?? '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
};

const resolveTusUser = async (req: unknown): Promise<User | null> => {
  const requestLike = req as { user?: User; headers?: Record<string, unknown> } | undefined;
  if (requestLike?.user) return requestLike.user;

  const token = getBearerToken(requestLike?.headers);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id?: string };
    if (!decoded?.id) return null;
    return await AppDataSource.getRepository(User).findOne({ where: { id: decoded.id } });
  } catch {
    return null;
  }
};

type TusServerLike = {
  handle: (req: any, res: any) => unknown;
  on: (event: unknown, handler: (...args: any[]) => unknown) => unknown;
};

export const createWarehouseTusServer = async (): Promise<TusServerLike> => {
  ensureTusDirectory();
  const [{ EVENTS, Server }, { FileStore }] = await Promise.all([
    dynamicImport<typeof import('@tus/server')>('@tus/server'),
    dynamicImport<typeof import('@tus/file-store')>('@tus/file-store'),
  ]);

  const server = new Server({
    path: TUS_PATH,
    datastore: new FileStore({ directory: TUS_TEMP_DIR }),
    relativeLocation: true,
    respectForwardedHeaders: true,
    maxSize: MAX_WAREHOUSE_PHOTO_BYTES,
  });

  scheduleTusCleanup();

  server.on(EVENTS.POST_FINISH, async (req, _res, upload) => {
    if (!upload) return;

    const metadata = (upload.metadata ?? {}) as Record<string, unknown>;
    const uploadSessionId = normalizeMetadataValue(metadata.uploadSessionId ?? metadata.uploadsessionid, 120);
    const clientHash = getMetadataClientHash(metadata);
    const mimeType = getUploadMimeType(metadata);
    const originalName = normalizeMetadataValue(metadata.filename, 255) || 'photo.jpg';
    const checklistItem = getChecklistItem(metadata);
    const phase = getUploadPhase(metadata);
    const tempPath = path.join(TUS_TEMP_DIR, upload.id);
    const resolvedUser = await resolveTusUser(req);
    const metadataUser = getMetadataUser(metadata);
    const user = resolvedUser ?? metadataUser;

    logger.info('Warehouse TUS upload finished', {
      uploadId: upload.id,
      uploadSessionId,
      clientHash,
      userId: user?.id,
    });

    try {
      if (!user || !WAREHOUSE_TUS_ROLES.has(user.role)) {
        await fs.promises.unlink(tempPath).catch(() => undefined);
        logger.warn('Warehouse TUS upload rejected by role policy', { uploadId: upload.id, userId: user?.id });
        return;
      }

      if (!uploadSessionId || !clientHash || !isAllowedWarehousePhotoMime(mimeType)) {
        await fs.promises.unlink(tempPath).catch(() => undefined);
        logger.warn('Warehouse TUS upload discarded due to invalid metadata', {
          uploadId: upload.id,
          uploadSessionId,
          clientHash,
          mimeType,
        });
        return;
      }

      const repository = AppDataSource.getRepository(WarehousePendingPhotoUpload);
      const existing = await repository.findOne({
        where: {
          uploadSessionId,
          clientHash,
          uploadedById: user.id,
        },
      });

      if (existing && existing.expiresAt > new Date()) {
        await cleanupTusUploadFiles(upload.id);
        return;
      }

      if (existing) {
        await deleteWarehousePendingPhotoFile(existing.uploadSessionId, existing.storedName).catch(() => undefined);
        await repository.delete({ id: existing.id });
      }

      const storedName = await moveWarehouseTusTempToPending(uploadSessionId, mimeType, tempPath, clientHash);
      const saved = repository.create({
        uploadSessionId,
        storedName,
        originalName,
        mimeType,
        sizeBytes: Number.isFinite(Number(upload.size)) ? Number(upload.size) : 0,
        clientHash,
        phase,
        checklistItem,
        uploadedById: user.id,
        uploadedByName: user.fullName,
        expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_HOURS * 60 * 60 * 1000),
      });
      try {
        await repository.save(saved);
      } catch (saveError) {
        await deleteWarehousePendingPhotoFile(uploadSessionId, storedName).catch(() => undefined);
        if ((saveError as { code?: string }).code === '23505') {
          await cleanupTusUploadFiles(upload.id);
          return;
        }
        throw saveError;
      }
      await cleanupTusUploadFiles(upload.id);
    } catch (error) {
      await cleanupTusUploadFiles(upload.id);
      logger.error('Warehouse TUS upload processing failed', {
        uploadId: upload.id,
        error: (error as Error).message,
      });
    }
  });

  return server;
};
