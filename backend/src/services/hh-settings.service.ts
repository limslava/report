import crypto from 'crypto';
import { AppDataSource } from '../config/data-source';
import { HhConnection } from '../models/hh-connection.model';
import { HhSyncRun } from '../models/hh-sync-run.model';
import { HhWebhookEvent } from '../models/hh-webhook-event.model';
import { encryptHhSecret, maskSecret } from './hh-crypto.service';

export type HhSettingsPayload = {
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri?: string | null;
  userAgent?: string | null;
};

const connectionRepo = () => AppDataSource.getRepository(HhConnection);
const syncRunRepo = () => AppDataSource.getRepository(HhSyncRun);
const webhookEventRepo = () => AppDataSource.getRepository(HhWebhookEvent);

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function maskWebhookSecret(value: string | null): string | null {
  return value ? '••••••••••••' : null;
}

export async function getActiveHhConnection(): Promise<HhConnection | null> {
  const [connection] = await connectionRepo().find({ order: { createdAt: 'DESC' }, take: 1 });
  return connection ?? null;
}

export function toHhConnectionDto(connection: HhConnection | null) {
  if (!connection) {
    return {
      configured: false,
      status: 'disconnected',
      clientId: null,
      clientSecretMask: null,
      redirectUri: null,
      userAgent: process.env.HH_USER_AGENT || null,
      employer: null,
      manager: null,
      accessTokenExpiresAt: null,
      webhookSecretMask: null,
      lastCheckedAt: null,
    };
  }

  return {
    configured: Boolean(connection.clientId && connection.redirectUri && (connection.clientSecretEnc || process.env.HH_CLIENT_SECRET)),
    status: connection.status,
    clientId: connection.clientId ?? process.env.HH_CLIENT_ID ?? null,
    clientSecretMask: maskSecret(connection.clientSecretEnc || process.env.HH_CLIENT_SECRET),
    redirectUri: connection.redirectUri ?? process.env.HH_REDIRECT_URI ?? null,
    userAgent: connection.userAgent ?? process.env.HH_USER_AGENT ?? null,
    employer: connection.employerId ? {
      id: connection.employerId,
      name: connection.employerName,
    } : null,
    manager: connection.managerId ? {
      id: connection.managerId,
      name: connection.managerName,
      accountId: connection.managerAccountId,
      authType: connection.authType,
    } : null,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    webhookSecretMask: maskWebhookSecret(connection.webhookSecretEnc),
    lastCheckedAt: connection.lastCheckedAt,
  };
}

export async function getHhSettings() {
  const connection = await getActiveHhConnection();
  return toHhConnectionDto(connection);
}

export async function updateHhSettings(payload: HhSettingsPayload) {
  const repository = connectionRepo();
  const existing = await getActiveHhConnection();
  const connection = existing ?? repository.create({
    status: 'disconnected',
    webhookSecretEnc: encryptHhSecret(crypto.randomBytes(32).toString('base64url')),
  });

  const clientId = normalizeOptionalString(payload.clientId);
  const clientSecret = normalizeOptionalString(payload.clientSecret);
  const redirectUri = normalizeOptionalString(payload.redirectUri);
  const userAgent = normalizeOptionalString(payload.userAgent);

  if (clientId !== undefined) connection.clientId = clientId;
  if (redirectUri !== undefined) connection.redirectUri = redirectUri;
  if (userAgent !== undefined) connection.userAgent = userAgent;
  if (clientSecret) {
    connection.clientSecretEnc = encryptHhSecret(clientSecret);
  }
  if (!connection.webhookSecretEnc) {
    connection.webhookSecretEnc = encryptHhSecret(crypto.randomBytes(32).toString('base64url'));
  }

  const saved = await repository.save(connection);
  return toHhConnectionDto(saved);
}

export async function getHhHealth() {
  const connection = await getActiveHhConnection();
  const [lastSyncRuns, pendingWebhookCount, failedWebhookCount] = await Promise.all([
    syncRunRepo().find({ order: { startedAt: 'DESC' }, take: 1 }),
    webhookEventRepo().count({ where: { status: 'received' } }),
    webhookEventRepo().count({ where: { status: 'failed' } }),
  ]);
  const lastSyncRun = lastSyncRuns[0] ?? null;

  return {
    status: connection?.status === 'active' ? 'OK' : 'NOT_CONNECTED',
    connection: toHhConnectionDto(connection),
    webhooks: {
      pending: pendingWebhookCount,
      failed: failedWebhookCount,
    },
    lastSyncRun: lastSyncRun ? {
      jobType: lastSyncRun.jobType,
      status: lastSyncRun.status,
      startedAt: lastSyncRun.startedAt,
      finishedAt: lastSyncRun.finishedAt,
      itemsProcessed: lastSyncRun.itemsProcessed,
      itemsFailed: lastSyncRun.itemsFailed,
      error: lastSyncRun.error,
    } : null,
  };
}
