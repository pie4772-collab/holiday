const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'holiday_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiClient(endpoint, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const token = getAuthToken();

  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    if (response.status === 401 && !String(endpoint).startsWith('/auth/login')) {
      setAuthToken('');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    }
    const error = await response.json().catch(() => ({ message: '요청 실패' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
