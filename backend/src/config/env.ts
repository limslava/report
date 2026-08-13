import type { SignOptions } from 'jsonwebtoken';

const FALLBACK_JWT_SECRET = 'fallback-secret';

function splitCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || FALLBACK_JWT_SECRET;
  if (isProductionEnv() && secret === FALLBACK_JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production');
  }
  return secret;
}

export function getJwtExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
}

export function getAllowedCorsOrigins(): string[] {
  const fromCsv = splitCsv(process.env.CORS_ALLOWED_ORIGINS);
  const farpostImportOrigins = splitCsv(process.env.FARPOST_IMPORT_ALLOWED_ORIGINS || 'https://www.farpost.ru');
  if (fromCsv.length > 0) {
    return [...new Set([...expandLocalhostOrigins(fromCsv), ...farpostImportOrigins])];
  }
  return [...new Set([...expandLocalhostOrigins([process.env.FRONTEND_URL || 'http://localhost:5173']), ...farpostImportOrigins])];
}

export function isAllowedCorsOrigin(origin: string | undefined, allowedOrigins = getAllowedCorsOrigins()): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  const isLocalExtensionOrigin = origin.startsWith('chrome-extension://');
  if (!isProductionEnv() && isLocalExtensionOrigin) return true;

  return false;
}

function expandLocalhostOrigins(origins: string[]): string[] {
  const expanded = new Set(origins);
  for (const origin of origins) {
    if (origin.startsWith('http://localhost:')) {
      expanded.add(origin.replace('http://localhost:', 'http://127.0.0.1:'));
    }
    if (origin.startsWith('http://127.0.0.1:')) {
      expanded.add(origin.replace('http://127.0.0.1:', 'http://localhost:'));
    }
  }
  return [...expanded];
}

export function getAppPort(): number {
  const rawPort = process.env.APP_PORT || process.env.PORT || '3000';
  const parsedPort = Number(rawPort);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    return 3000;
  }

  const isPrivilegedPort = parsedPort < 1024;
  const canBindPrivilegedPort = typeof process.getuid === 'function' ? process.getuid() === 0 : false;
  if (isPrivilegedPort && !canBindPrivilegedPort) {
    return 3000;
  }

  return parsedPort;
}

export function getHhCryptoKey(): string {
  const key = process.env.HH_CRYPTO_KEY || '';
  if (isProductionEnv() && !key) {
    throw new Error('HH_CRYPTO_KEY is required in production (HR module stores secrets encrypted)');
  }
  return key;
}

export function getHhApiBaseUrl(): string {
  return process.env.HH_API_BASE_URL || 'https://api.hh.ru';
}

export function getHhUserAgent(): string {
  return process.env.HH_USER_AGENT || '';
}

export function getHhRateLimitRps(): number {
  const parsed = Number(process.env.HH_RATE_LIMIT_RPS || '5');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function getHhPiiRetentionDays(): number {
  const parsed = Number(process.env.HH_PII_RETENTION_DAYS || '180');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 180;
}

export function isHhSyncEnabled(): boolean {
  return process.env.HH_SYNC_ENABLED !== 'false';
}

/**
 * Слепой отбор: скрывать ФИО кандидата от автора заявки на подбор.
 * По умолчанию выключено — закон этого не требует, руководитель всё равно
 * увидит кандидата на собеседовании. Включается, если политика обработки ПДн
 * компании предписывает анонимный скрининг.
 */
export function isHrAnonymousScreeningEnabled(): boolean {
  return process.env.HR_ANONYMOUS_SCREENING === 'true';
}

/** Срок жизни import-токена расширения FarPost, дней. */
export function getHhImportTokenTtlDays(): number {
  const parsed = Number(process.env.HH_IMPORT_TOKEN_TTL_DAYS || '30');
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 365 ? parsed : 30;
}

export function assertProductionEnv(): void {
  if (!isProductionEnv()) return;
  getJwtSecret();
  getHhCryptoKey();
}
