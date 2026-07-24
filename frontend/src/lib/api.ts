export type ApiProblem = { type?: string; title: string; status: number; detail?: string }
let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null
export function setAccessToken(token: string | null) { accessToken = token }
async function refresh() {
  if (!refreshPromise) refreshPromise = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' }).then(async response => {
    if (!response.ok) return null
    const data = await response.json() as { access_token: string }
    setAccessToken(data.access_token); return data.access_token
  }).finally(() => { refreshPromise = null })
  return refreshPromise
}
export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers); if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && retry && await refresh()) return api<T>(path, init, false)
  if (!response.ok) { let problem: ApiProblem = { title: '發生錯誤', status: response.status }; try { problem = await response.json() } catch { /* non-JSON upstream response */ } throw problem }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
