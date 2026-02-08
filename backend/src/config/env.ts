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

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '7d';
}

export function getAllowedCorsOrigins(): string[] {
  const fromCsv = splitCsv(process.env.CORS_ALLOWED_ORIGINS);
  if (fromCsv.length > 0) {
    return fromCsv;
  }
  return [process.env.FRONTEND_URL || 'http://localhost:5173'];
}

export function getAppPort(): number {
  return Number(process.env.APP_PORT || process.env.PORT || 3000);
}

export function assertProductionEnv(): void {
  if (!isProductionEnv()) return;
  getJwtSecret();
}
