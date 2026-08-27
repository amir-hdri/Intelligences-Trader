/**
 * Intelligences-Trader — frontend API client.
 *
 * Centralizes the ML backend (port 3000) calls, manages the JWT access token,
 * and attaches the Authorization header to protected endpoints. All calls
 * degrade gracefully so the UI keeps working offline (local-only mode).
 */
import { API_BASE_URL } from '../constants';

const TOKEN_KEY = 'ime_auth_token_v1';
const REFRESH_KEY = 'ime_auth_refresh_v1';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isAuthed(): boolean {
  return !!readToken();
}

export function getToken(): string | null {
  return readToken();
}

function storeTokens(accessToken: string, refreshToken?: string) {
  try {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch {
    /* storage unavailable */
  }
}

export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

/** Login against the backend and cache the access token. */
export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `Login failed (${res.status})` };
    }
    const data = await res.json();
    storeTokens(data.accessToken, data.refreshToken);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Generic authenticated fetch. Returns { status, json } and never throws. */
export async function apiFetch(path: string, options: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: any }> {
  const token = readToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

// --- Domain helpers ---------------------------------------------------------

export async function postTrade(trade: {
  symbol: string; side: 'BUY' | 'SELL'; quantity?: number; entryPrice: number; strategy?: string;
}): Promise<{ ok: boolean; id?: number }> {
  const res = await apiFetch('/api/trades', { method: 'POST', body: trade });
  return res.status === 201 ? { ok: true, id: res.json?.id } : { ok: false };
}

export async function savePrediction(p: {
  symbol: string; action: string; entryPrice: number; targetPrice: number;
  stopLoss: number; confidence: number; indicators?: unknown; reason?: string; weights?: unknown;
}): Promise<{ ok: boolean; id?: string }> {
  const res = await apiFetch('/api/predictions', { method: 'POST', body: p });
  return res.status === 201 ? { ok: true, id: res.json?.id } : { ok: false };
}

export async function fetchPredictions(symbol?: string, status?: string): Promise<any[]> {
  const qs = new URLSearchParams();
  if (symbol) qs.set('symbol', symbol);
  if (status) qs.set('status', status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiFetch(`/api/predictions${suffix}`);
  return res.status === 200 && res.json ? res.json.predictions : [];
}

export async function evaluatePredictions(symbol: string, currentPrice: number): Promise<number> {
  const res = await apiFetch('/api/predictions/evaluate', { method: 'POST', body: { symbol, currentPrice } });
  return res.status === 200 ? (res.json?.settled ?? 0) : 0;
}
