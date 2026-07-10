type FnsSearchResultItem = {
  n?: string;
  c?: string;
  i?: string;
  o?: string;
  p?: string;
  k?: string;
  a?: string;
};

type FnsResolvedCounterparty = {
  inn: string;
  nameFull: string;
  nameShort: string | null;
  counterpartyForm: string | null;
  ogrn: string | null;
  kpp: string | null;
  address: string | null;
  sourcePayload: Record<string, unknown>;
};

export class FnsServiceUnavailableError extends Error {
  constructor(message = 'Сервис ФНС временно недоступен') {
    super(message);
    this.name = 'FnsServiceUnavailableError';
  }
}

function normalizeForm(name: string, kind?: string): string | null {
  if (String(kind || '').toLowerCase() === 'fl') return 'ip';
  const upper = name.toUpperCase();
  if (upper.includes('ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ')) return 'ip';
  if (upper.includes('ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО')) return 'zao';
  if (upper.includes('ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО')) return 'pao';
  if (upper.includes('АКЦИОНЕРНОЕ ОБЩЕСТВО')) return 'ao';
  if (upper.includes('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ')) return 'ooo';
  return null;
}

async function fetchFnsFirstRow(query: string): Promise<FnsSearchResultItem | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://egrul.nalog.ru/index.html',
  };

  try {
    const initResponse = await fetch('https://egrul.nalog.ru/', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams({ query }).toString(),
      signal: controller.signal,
    });
    if (!initResponse.ok) {
      throw new FnsServiceUnavailableError();
    }
    const initData = await initResponse.json() as any;
    const token = initData?.t;
    if (!token) {
      return null;
    }
    const cookie = initResponse.headers.get('set-cookie');

    const pollHeaders = cookie ? { ...headers, Cookie: cookie } : headers;

    // FNS may prepare search results asynchronously; poll for a short period.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const resultResponse = await fetch(`https://egrul.nalog.ru/search-result/${token}`, {
        method: 'GET',
        headers: pollHeaders,
        signal: controller.signal,
      });
      if (!resultResponse.ok) {
        throw new FnsServiceUnavailableError();
      }
      const resultData = await resultResponse.json() as any;
      const rows = Array.isArray(resultData?.rows) ? (resultData.rows as FnsSearchResultItem[]) : [];
      if (rows.length > 0) {
        return rows[0];
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return null;
  } catch (error) {
    if (error instanceof FnsServiceUnavailableError) {
      throw error;
    }
    throw new FnsServiceUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

function mapFnsRowToCounterparty(row: FnsSearchResultItem, fallbackInn?: string): FnsResolvedCounterparty | null {
  const nameFull = (row.n || '').trim();
  if (!nameFull) return null;
  const inn = String(row.i || fallbackInn || '').trim();
  if (!/^\d{10}$|^\d{12}$/.test(inn)) return null;
  const shortName = typeof row.c === 'string' ? row.c.trim() : '';
  return {
    inn,
    nameFull,
    nameShort: shortName || null,
    counterpartyForm: normalizeForm(nameFull, row.k),
    ogrn: row.o || null,
    kpp: row.p || null,
    address: row.a || null,
    sourcePayload: row as Record<string, unknown>,
  };
}

export async function fetchCounterpartyFromFnsByInn(inn: string): Promise<FnsResolvedCounterparty | null> {
  const row = await fetchFnsFirstRow(inn);
  if (!row) return null;
  return mapFnsRowToCounterparty(row, inn);
}

export async function fetchCounterpartyFromFnsByName(name: string): Promise<FnsResolvedCounterparty | null> {
  const row = await fetchFnsFirstRow(name);
  if (!row) return null;
  return mapFnsRowToCounterparty(row);
}
