import { useAuthStore } from '../store/auth-store';

export function getPlansWebSocketUrl(): string | null {
  const token = useAuthStore.getState().token;
  if (!token) {
    return null;
  }

  const runtimeApiBase = import.meta.env.VITE_API_URL || '/api';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  let host = window.location.host;

  try {
    if (runtimeApiBase.startsWith('http://') || runtimeApiBase.startsWith('https://')) {
      const apiUrl = new URL(runtimeApiBase);
      host = apiUrl.host;
    } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      host = 'localhost:3001';
    }
  } catch {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      host = 'localhost:3001';
    }
  }
  const url = new URL(`${protocol}://${host}/ws/plans`);
  url.searchParams.set('token', token);
  return url.toString();
}
