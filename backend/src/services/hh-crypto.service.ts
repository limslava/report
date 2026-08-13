import crypto from 'crypto';
import { getHhCryptoKey } from '../config/env';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = getHhCryptoKey();
  if (!raw) {
    const error: any = new Error('HH_CRYPTO_KEY is required to store hh.ru secrets');
    error.statusCode = 500;
    throw error;
  }

  const trimmed = raw.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === 32) {
    return decoded;
  }

  const error: any = new Error('HH_CRYPTO_KEY must be 32 bytes as base64 or 64 hex characters');
  error.statusCode = 500;
  throw error;
}

export function encryptHhSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptHhSecret(payload: string): string {
  const [ivRaw, authTagRaw, encryptedRaw] = payload.split('.');
  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    const error: any = new Error('Invalid encrypted hh.ru secret payload');
    error.statusCode = 500;
    throw error;
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return '••••••••';
}

/**
 * Формат зашифрованного значения: iv.authTag.ciphertext (base64url через точку).
 * Используется, чтобы отличить уже зашифрованные значения от legacy-плейнтекста
 * при миграции и при чтении.
 */
const ENCRYPTED_FORMAT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+$/;

export function looksEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && ENCRYPTED_FORMAT.test(value));
}

function decryptOrPassthrough(value: string): string {
  // Legacy-строки (до включения шифрования) отдаём как есть,
  // чтобы чтение не падало до завершения миграции данных.
  if (!looksEncrypted(value)) return value;
  return decryptHhSecret(value);
}

/**
 * TypeORM-трансформер: контакты кандидатов шифруются прозрачно для остального
 * кода — в БД лежит AES-256-GCM, наружу колонка ведёт себя как обычный текст.
 * Сравнения в SQL по таким колонкам не работают (IV случайный) — для поиска
 * и дедупликации предназначены детерминированные хэши (hashHhContact).
 */
export const encryptedContactTransformer = {
  to: (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    return encryptHhSecret(normalized);
  },
  from: (value: string | null): string | null => {
    if (value === null || value === undefined) return null;
    return decryptOrPassthrough(value);
  },
};

/** Нормализация перед хэшированием: телефоны к цифрам, email к нижнему регистру. */
export function normalizeContactForHash(kind: 'phone' | 'email', value: string): string {
  if (kind === 'phone') {
    const digits = value.replace(/\D/g, '');
    // 8XXXXXXXXXX и +7XXXXXXXXXX — один и тот же номер.
    if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
    return digits;
  }
  return value.trim().toLowerCase();
}

/**
 * Детерминированный HMAC-SHA256 для поиска/дедупликации по контакту.
 * Подключ выводится из HH_CRYPTO_KEY, чтобы хэши нельзя было пересчитать
 * без ключа шифрования.
 */
export function hashHhContact(kind: 'phone' | 'email', value: string): string {
  const subKey = crypto.createHmac('sha256', getKey()).update('hh-contact-hash-v1').digest();
  return crypto.createHmac('sha256', subKey).update(normalizeContactForHash(kind, value)).digest('hex');
}
