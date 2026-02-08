type UnknownError = {
  code?: string | number;
  message?: string;
};

const TRANSIENT_CODES = new Set<string>([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '55006', // object_in_use
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08006', // connection_failure
]);

const TRANSIENT_MESSAGE_PARTS = [
  'connection terminated',
  'terminating connection',
  'could not connect',
  'connection refused',
  'connection timeout',
  'timeout',
  'server closed the connection',
  'database is not ready',
  'remaining connection slots are reserved',
];

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }

  const { code, message } = err as UnknownError;
  const codeStr = typeof code === 'number' ? String(code) : code;
  if (codeStr && TRANSIENT_CODES.has(codeStr)) {
    return true;
  }

  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    return TRANSIENT_MESSAGE_PARTS.some((part) => lower.includes(part));
  }

  return false;
}
