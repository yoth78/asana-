const TOKEN_KEY = 'platform_token';

/** API host for /platform/api. Empty in local Vite (proxy). Set on Render Static Site. */
export function platformApiBase(): string {
  const raw = (import.meta.env.VITE_PLATFORM_API_BASE as string | undefined) || '';
  return raw.replace(/\/$/, '');
}

export function platformApiUrl(path: string): string {
  const base = platformApiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}/platform/api${normalized}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function platformFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(platformApiUrl(path), { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
