import { useAuthStore } from '../store/auth-store';

export function getPlansWebSocketUrl(): string | null {
  const token = useAuthStore.getState().token;
  if (!token) {
    return null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'localhost:3000'
      : window.location.host;
  const url = new URL(`${protocol}://${host}/ws/plans`);
  url.searchParams.set('token', token);
  return url.toString();
}
