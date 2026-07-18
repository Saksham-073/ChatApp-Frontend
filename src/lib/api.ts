import { socketId } from './echo'
import { API_ORIGIN } from './config'

const BASE = `${API_ORIGIN}/api`

export interface Paginated<T> {
  data: T[]
  meta?: { next_cursor: string | null; prev_cursor: string | null; per_page: number }
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token')
  const sid = socketId()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Lets the backend's broadcast(...)->toOthers() exclude this client
      ...(sid ? { 'X-Socket-ID': sid } : {}),
      ...(options.headers as Record<string, string> | undefined ?? {}),
    },
  })

  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    throw new ApiError('Unauthenticated.', 401)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new ApiError(body.message ?? `HTTP ${res.status}`, res.status)
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path: string) => apiFetch<void>(path, { method: 'DELETE' }),
}
