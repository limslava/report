export type SinokorTrackingData = {
  blNo: string;
  bookingStatus: string | null;
  issueStatus: string | null;
  receiptStatus: string | null;
  service: string | null;
  vessel: string | null;
  voyage: string | null;
  polCode: string | null;
  pol: string | null;
  loadingTerminal: string | null;
  podCode: string | null;
  pod: string | null;
  dischargeTerminal: string | null;
  etd: string | null;
  eta: string | null;
  containers: string[];
};

export type SinokorTrackingResult = {
  found: boolean;
  blNo: string;
  sourceUrl: string;
  fetchedAt: string;
  upstream: {
    status: number;
    ok: boolean;
    contentType: string | null;
  };
  data: SinokorTrackingData | null;
  diagnostics?: {
    code: 'upstream_unavailable' | 'parse_incomplete' | 'not_found';
    message: string;
    preview?: string;
  };
};

const SINOKOR_BASE_URL = 'https://ebiz.sinokor.co.kr';
const REQUEST_TIMEOUT_MS = 15000;

function normalizeText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .trim();
}

function extractHiddenInput(html: string, id: string): string | null {
  const pattern = new RegExp(`<input[^>]*id=["']${id}["'][^>]*value=["']([^"']*)["'][^>]*>`, 'i');
  const match = html.match(pattern);
  const value = match?.[1] ? decodeHtml(match[1]) : '';
  return value || null;
}

function extractLabelValue(html: string, label: string): string | null {
  const pattern = new RegExp(
    `<label[^>]*>\\s*${label}\\s*<\\/label>[\\s\\S]*?<div[^>]*class=["'][^"']*font-bold[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`,
    'i'
  );
  const match = html.match(pattern);
  const value = match?.[1] ? normalizeText(match[1]) : '';
  return value || null;
}

function extractContainers(text: string): string[] {
  const matches = text.match(/\b[A-Z]{4}\d{7}\b/g) ?? [];
  return Array.from(new Set(matches));
}

function extractBlNo(html: string, fallbackBlNo: string): string {
  return extractLabelValue(html, 'B/L No\\.')?.match(/\bSNKO[A-Z0-9]{12}\b/i)?.[0]?.toUpperCase()
    ?? fallbackBlNo;
}

function parseSinokorHtml(html: string, fallbackBlNo: string): SinokorTrackingData | null {
  const text = normalizeText(html);
  const blNo = extractBlNo(html, fallbackBlNo);
  const bookingStatus = extractLabelValue(html, 'B/K Status');
  const issueStatus = extractLabelValue(html, 'Issue status');
  const receiptStatus = extractLabelValue(html, 'Receipt Status');
  const service = extractHiddenInput(html, 'arrSvc');
  const vessel = extractHiddenInput(html, 'arrVslnm');
  const voyage = extractHiddenInput(html, 'arrVyg');
  const polCode = extractHiddenInput(html, 'arrPol');
  const pol = extractHiddenInput(html, 'arrPolnm');
  const loadingTerminal = extractHiddenInput(html, 'arrLwharfnm');
  const podCode = extractHiddenInput(html, 'arrPod');
  const pod = extractHiddenInput(html, 'arrPodnm');
  const dischargeTerminal = extractHiddenInput(html, 'arrDwharfnm');
  const etd = extractHiddenInput(html, 'arrEtd');
  const eta = extractHiddenInput(html, 'arrEta');
  const containers = extractContainers(text);

  const hasAnyUsefulField = vessel || voyage || pol || pod || etd || eta || containers.length > 0;
  if (!hasAnyUsefulField && !text.includes(fallbackBlNo)) {
    return null;
  }

  return {
    blNo,
    bookingStatus,
    issueStatus,
    receiptStatus,
    service,
    vessel,
    voyage,
    polCode,
    pol,
    loadingTerminal,
    podCode,
    pod,
    dischargeTerminal,
    etd,
    eta,
    containers,
  };
}

export async function lookupSinokorBl(blNo: string, options: { debug?: boolean } = {}): Promise<SinokorTrackingResult> {
  const normalizedBlNo = blNo.trim().toUpperCase();
  const sourceUrl = `${SINOKOR_BASE_URL}/BLDetail?blno=${encodeURIComponent(normalizedBlNo)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8,ru;q=0.7',
        Referer: `${SINOKOR_BASE_URL}/?lang=EN`,
      },
    });
    const html = await response.text();
    const contentType = response.headers.get('content-type');
    const data = response.ok ? parseSinokorHtml(html, normalizedBlNo) : null;
    const preview = options.debug ? normalizeText(html).slice(0, 1200) : undefined;

    if (!response.ok) {
      return {
        found: false,
        blNo: normalizedBlNo,
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        upstream: {
          status: response.status,
          ok: false,
          contentType,
        },
        data: null,
        diagnostics: {
          code: 'upstream_unavailable',
          message: `Sinokor returned HTTP ${response.status}`,
          preview,
        },
      };
    }

    if (!data) {
      return {
        found: false,
        blNo: normalizedBlNo,
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        upstream: {
          status: response.status,
          ok: true,
          contentType,
        },
        data: null,
        diagnostics: {
          code: 'not_found',
          message: 'Sinokor response did not contain recognizable BL tracking data',
          preview,
        },
      };
    }

    const hasCoreFields = Boolean(data.vessel || data.pol || data.pod || data.eta || data.etd || data.containers.length);

    return {
      found: true,
      blNo: normalizedBlNo,
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      upstream: {
        status: response.status,
        ok: true,
        contentType,
      },
      data,
      diagnostics: hasCoreFields
        ? undefined
        : {
            code: 'parse_incomplete',
            message: 'Sinokor response was reachable, but only partial BL data could be parsed',
            preview,
          },
    };
  } catch (error: any) {
    return {
      found: false,
      blNo: normalizedBlNo,
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      upstream: {
        status: 0,
        ok: false,
        contentType: null,
      },
      data: null,
      diagnostics: {
        code: 'upstream_unavailable',
        message: error?.name === 'AbortError'
          ? `Sinokor request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : error?.message || 'Sinokor request failed',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
