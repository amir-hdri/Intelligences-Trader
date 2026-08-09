export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

export const buildApiHeaders = (
  accessToken = '',
  headers?: HeadersInit,
  includeJson = false,
): Headers => {
  const result = new Headers(headers);
  if (includeJson && !result.has('Content-Type')) result.set('Content-Type', 'application/json');
  if (accessToken.trim()) result.set('Authorization', `Bearer ${accessToken.trim()}`);
  return result;
};

export async function apiFetch(
  input: RequestInfo | URL,
  accessToken = '',
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  try {
    return await fetch(input, {
      ...init,
      headers: buildApiHeaders(accessToken, init.headers, init.body != null),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  accessToken = '',
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const response = await apiFetch(input, accessToken, init, timeoutMs);
  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `Request failed with HTTP ${response.status}`;
    throw new ApiRequestError(message, response.status, payload);
  }
  return payload as T;
}
