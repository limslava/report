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
  if (fromCsv.length > 0) {
    return expandLocalhostOrigins(fromCsv);
  }
  return expandLocalhostOrigins([process.env.FRONTEND_URL || 'http://localhost:5173']);
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

export function assertProductionEnv(): void {
  if (!isProductionEnv()) return;
  getJwtSecret();
}
