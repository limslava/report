/**
 * Единый разбор ошибки axios/сервера в текст для пользователя.
 * Заменяет повторяющуюся идиому err?.response?.data?.message || err?.message || '...'.
 */
export function extractApiError(error: unknown, fallback: string): string {
  const candidate = error as {
    response?: { data?: { message?: unknown; error?: unknown } };
    message?: unknown;
  } | null;
  const fromResponse = candidate?.response?.data?.message ?? candidate?.response?.data?.error;
  if (typeof fromResponse === 'string' && fromResponse.trim()) return fromResponse;
  if (typeof candidate?.message === 'string' && candidate.message.trim()) return candidate.message;
  return fallback;
}
