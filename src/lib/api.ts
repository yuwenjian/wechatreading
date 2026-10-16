import { accessToken } from './supabase'

/** 解析响应体，失败时抛出后端给的可读文案 */
async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: any = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${res.status}）`)
  }
  return data as T
}

function headers(token: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const token = await accessToken()
  return parse<T>(
    await fetch(path, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body),
    }),
  )
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = await accessToken()
  return parse<T>(await fetch(path, { headers: headers(token) }))
}
