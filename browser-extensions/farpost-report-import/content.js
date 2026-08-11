const BUTTON_ID = 'report-farpost-import-button';
const TOAST_ID = 'report-farpost-import-toast';

const isFarpostResumePage = () => (
  location.hostname === 'www.farpost.ru'
  && location.pathname.includes('/rabota/')
);

const showToast = (message, type = 'info') => {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    document.documentElement.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `report-farpost-import-toast report-farpost-import-toast--${type}`;
  window.setTimeout(() => {
    if (toast) toast.className = 'report-farpost-import-toast';
  }, 4500);
};

const getReadablePageText = () => {
  const titleParts = [
    document.title,
    ...Array.from(document.querySelectorAll('h1, h2')).map((node) => node.innerText),
  ];
  const mainNode = document.querySelector('main, article, [role="main"], .bull-content, .viewbull, .page-content') || document.body;
  const clone = mainNode?.cloneNode(true);

  if (!clone) return document.documentElement.innerText || '';

  clone.querySelectorAll('script, style, noscript, svg, nav, footer, header, aside, form, button').forEach((node) => node.remove());
  const lines = [
    ...titleParts,
    clone.innerText,
  ]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return Array.from(new Set(lines)).join('\n');
};

const importCurrentPage = () => {
  const button = document.getElementById(BUTTON_ID);
  if (button) {
    button.setAttribute('disabled', 'true');
    button.textContent = 'Сохраняю...';
  }

  chrome.runtime.sendMessage({
    type: 'REPORT_IMPORT_FARPOST_RESUME',
    rawText: getReadablePageText(),
    sourceUrl: location.href,
  }, (response) => {
    if (button) {
      button.removeAttribute('disabled');
      button.textContent = 'Сохранить в Report';
    }

    if (!response?.ok) {
      showToast(response?.error || 'Не удалось сохранить кандидата', 'error');
      return;
    }

    const name = response.data?.candidate?.fullName || 'кандидат';
    showToast(`Сохранено в Report: ${name}`, 'success');
  });
};

const injectButton = () => {
  if (!isFarpostResumePage() || document.getElementById(BUTTON_ID)) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Сохранить в Report';
  button.addEventListener('click', importCurrentPage);
  document.documentElement.appendChild(button);
};

injectButton();
