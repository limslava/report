const DEFAULT_API_URL = 'http://localhost:3101/api';

const normalizeApiUrl = (value) => (value || DEFAULT_API_URL).replace(/\/+$/, '');

const readSettings = () => new Promise((resolve) => {
  chrome.storage.local.get(['apiUrl', 'token', 'user'], (result) => {
    resolve({
      apiUrl: normalizeApiUrl(result.apiUrl),
      token: result.token || '',
      user: result.user || null,
    });
  });
});

const postJson = async (url, token, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return data;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'REPORT_IMPORT_FARPOST_RESUME') {
    (async () => {
      const settings = await readSettings();
      if (!settings.token) {
        throw new Error('Сначала войдите в Report через иконку расширения');
      }
      const data = await postJson(`${settings.apiUrl}/hh/import/farpost/resume`, settings.token, {
        rawText: message.rawText || '',
        sourceUrl: message.sourceUrl || '',
      });
      sendResponse({ ok: true, data });
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'REPORT_GET_STATUS') {
    readSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
