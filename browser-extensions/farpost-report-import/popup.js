const DEFAULT_API_URL = 'http://localhost:3101/api';

const apiUrlInput = document.getElementById('apiUrl');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login');
const logoutButton = document.getElementById('logout');
const statusBox = document.getElementById('status');

const normalizeApiUrl = (value) => (value || DEFAULT_API_URL).replace(/\/+$/, '');

const setStatus = (message, type = '') => {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
};

const loadState = () => {
  chrome.storage.local.get(['apiUrl', 'user', 'importTokenExpiresAt'], (result) => {
    apiUrlInput.value = result.apiUrl || DEFAULT_API_URL;
    if (result.user) {
      const expires = result.importTokenExpiresAt
        ? ` (доступ до ${new Date(result.importTokenExpiresAt).toLocaleDateString('ru-RU')})`
        : '';
      setStatus(`Подключено: ${result.user.fullName || result.user.email}${expires}`, 'ok');
    } else {
      setStatus('Не подключено');
    }
  });
};

const login = async () => {
  const apiUrl = normalizeApiUrl(apiUrlInput.value);
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    setStatus('Введите email и пароль', 'error');
    return;
  }

  loginButton.disabled = true;
  setStatus('Подключаюсь...');
  try {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }

    // Полный JWT в chrome.storage не сохраняем: расширение работает на страницах
    // чужого сайта. Сразу меняем его на import-token, который открывает только
    // эндпоинт импорта резюме и живёт ограниченный срок.
    const tokenResponse = await fetch(`${apiUrl}/hh/import-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.token}` },
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      throw new Error(tokenData.message || tokenData.error || `HTTP ${tokenResponse.status}: не удалось получить токен импорта`);
    }

    chrome.storage.local.set({
      apiUrl,
      token: tokenData.token,
      importTokenExpiresAt: tokenData.expiresAt,
      user: data.user,
    }, () => {
      passwordInput.value = '';
      setStatus(`Подключено: ${data.user.fullName || data.user.email} (доступ до ${new Date(tokenData.expiresAt).toLocaleDateString('ru-RU')})`, 'ok');
    });
  } catch (error) {
    setStatus(`Ошибка входа: ${error.message}`, 'error');
  } finally {
    loginButton.disabled = false;
  }
};

const logout = () => {
  chrome.storage.local.remove(['token', 'user', 'importTokenExpiresAt'], () => {
    setStatus('Не подключено');
  });
};

loginButton.addEventListener('click', login);
logoutButton.addEventListener('click', logout);
loadState();
