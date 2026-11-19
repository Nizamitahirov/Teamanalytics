import type { ApiError, MeResponse } from '../../shared/schema';

/** API xətası: serverin az mətni + maşın kodu (SPEC §4.4). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      method: rest.method ?? (json !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiRequestError('network', 0, 'network');
  }
  const body = (await res.json().catch(() => ({}))) as Partial<ApiError> & T;
  if (!res.ok)
    throw new ApiRequestError(body.error || `Server xətası (${res.status})`, res.status, body.code || 'http_' + res.status);
  return body;
}

export const getMe = () => api<MeResponse>('/api/me');
export const login = (username: string, password: string) =>
  api<{ ok: true; user: string }>('/api/login', { json: { username, password } });
export const logout = () => api<{ ok: true }>('/api/logout', { method: 'POST' });
