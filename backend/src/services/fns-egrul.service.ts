import { PDFParse } from 'pdf-parse';

type FnsSearchResultItem = {
  n?: string;
  c?: string;
  i?: string;
  o?: string;
  p?: string;
  k?: string;
  a?: string;
  g?: string;
  t?: string;
};

type FnsResolvedCounterparty = {
  inn: string;
  nameFull: string;
  nameShort: string | null;
  counterpartyForm: string | null;
  ogrn: string | null;
  kpp: string | null;
  address: string | null;
  signerName: string | null;
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

export function normalizeFnsSignerName(value?: string | null): string | null {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const withoutColonPrefix = raw
    .replace(/^(?:Руководитель юридического лица|Руководитель|Генеральный директор|Директор|Президент|Управляющий|Исполняющий обязанности директора)\s*:\s*/i, '')
    .trim();

  const withoutTitlePrefix = withoutColonPrefix
    .replace(/^(?:Генеральный\s+директор|Директор|Президент|Управляющий|Исполняющий\s+обязанности\s+директора)\s+/i, '')
    .trim();

  return withoutTitlePrefix || null;
}

function normalizeFnsAddress(value?: string | null): string | null {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')
    .trim();
  return normalized || null;
}

function extractLegalAddressFromEgrulText(text: string): string | null {
  const normalizedText = text.replace(/\r/g, '');
  const match = normalizedText.match(/(?:^|\n)\s*\d+\s+Адрес юридического лица\s+([\s\S]*?)(?:\n\s*\d+\s+ГРН и дата внесения|\n\s*Сведения о регистрации)/i);
  if (!match) return null;

  return normalizeFnsAddress(match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', '));
}

async function fetchAddressFromFnsExtract(token: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const requestResponse = await fetch(`https://egrul.nalog.ru/vyp-request/${token}?r=`, {
      method: 'GET',
      headers,
    });
    if (!requestResponse.ok) return null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const statusResponse = await fetch(`https://egrul.nalog.ru/vyp-status/${token}?r=${Date.now()}`, {
        method: 'GET',
        headers,
      });
      if (!statusResponse.ok) return null;
      const statusData = await statusResponse.json() as any;
      if (statusData?.status === 'ready') break;
      if (statusData?.status === 'error') return null;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const downloadResponse = await fetch(`https://egrul.nalog.ru/vyp-download/${token}`, {
      method: 'GET',
      headers,
    });
    if (!downloadResponse.ok) return null;
    const contentType = downloadResponse.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf')) return null;

    const pdfBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const parsed = await parser.getText();
      return extractLegalAddressFromEgrulText(parsed.text);
    } finally {
      await parser.destroy();
    }
  } catch {
    return null;
  }
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
        if (!rows[0].a && rows[0].t) {
          rows[0].a = await fetchAddressFromFnsExtract(rows[0].t, pollHeaders) || undefined;
        }
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
    signerName: normalizeFnsSignerName(row.g),
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
