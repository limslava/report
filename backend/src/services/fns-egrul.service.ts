type FnsSearchResultItem = {
  n?: string;
  c?: string;
  o?: string;
  k?: string;
  a?: string;
};

function normalizeForm(name: string): string | null {
  const upper = name.toUpperCase();
  if (upper.includes('ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ')) return 'ip';
  if (upper.includes('ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО')) return 'zao';
  if (upper.includes('ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО')) return 'pao';
  if (upper.includes('АКЦИОНЕРНОЕ ОБЩЕСТВО')) return 'ao';
  if (upper.includes('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ')) return 'ooo';
  return null;
}

export async function fetchCounterpartyFromFnsByInn(inn: string): Promise<{
  inn: string;
  nameFull: string;
  nameShort: string | null;
  counterpartyForm: string | null;
  ogrn: string | null;
  kpp: string | null;
  address: string | null;
  sourcePayload: Record<string, unknown>;
} | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://egrul.nalog.ru/index.html',
  };

  const initResponse = await fetch('https://egrul.nalog.ru/', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams({ query: inn }).toString(),
    signal: controller.signal,
  });
  const initData = await initResponse.json() as any;
  const token = initData?.t;
  if (!token) return null;

  const resultResponse = await fetch(`https://egrul.nalog.ru/search-result/${token}`, {
    method: 'GET',
    headers,
    signal: controller.signal,
  });
  clearTimeout(timeout);
  const resultData = await resultResponse.json() as any;
  const rows = Array.isArray(resultData?.rows) ? (resultData.rows as FnsSearchResultItem[]) : [];
  if (rows.length === 0) return null;

  const row = rows[0];
  const nameFull = (row.n || '').trim();
  if (!nameFull) return null;

  return {
    inn,
    nameFull,
    nameShort: null,
    counterpartyForm: normalizeForm(nameFull),
    ogrn: row.o || null,
    kpp: row.k || null,
    address: row.a || null,
    sourcePayload: row as Record<string, unknown>,
  };
}
