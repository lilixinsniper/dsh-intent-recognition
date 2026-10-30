/** Same-origin API client for the host half. */

const BASE = '/dsh-intent-recognition/api'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = {}
  try {
    data = JSON.parse(text)
  } catch {
    /* binary or empty */
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function downloadExport(scenarioId: string): Promise<void> {
  const res = await fetch(`${BASE}/scenarios/${scenarioId}/intents/export`)
  if (!res.ok) throw new ApiError(res.status, '导出失败')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'intents.xlsx'
  a.click()
  URL.revokeObjectURL(a.href)
}
