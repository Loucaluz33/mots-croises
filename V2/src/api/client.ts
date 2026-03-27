// Centralized API client — all backend calls go through here

const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${res.status}: ${err}`)
  }
  return res.json()
}

// ========== GRIDS ==========

export const gridsApi = {
  list: () => request<{ grids: { nom: string; terminee: boolean; date_creation: string; date_modif: string }[] }>('/grids'),
  get: (name: string) => request<{ grid: string }>(`/grids/${encodeURIComponent(name)}`),
  save: (name: string, data: unknown) =>
    request<{ ok: boolean }>('/grids', {
      method: 'POST',
      body: JSON.stringify({ name, data: JSON.stringify(data) }),
    }),
  delete: (name: string) =>
    request<{ ok: boolean }>(`/grids/${encodeURIComponent(name)}`, { method: 'DELETE' }),
}

// ========== SUGGESTIONS ==========

export const suggestionsApi = {
  search: (pattern: string, sources: string) =>
    request<{ results: unknown[] }>(`/suggestions/search?pattern=${encodeURIComponent(pattern)}&sources=${encodeURIComponent(sources)}`),
}

// ========== DICTIONARIES ==========

export const dictionariesApi = {
  list: () => request<{ dictionaries: unknown[] }>('/dictionaries'),
  create: (name: string) =>
    request<{ id: number }>('/dictionaries', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getWords: (dictId: number, params: string) =>
    request<{ words: unknown[] }>(`/dictionaries/${dictId}/words?${params}`),
  addWord: (dictId: number, word: unknown) =>
    request<{ id: number }>(`/dictionaries/${dictId}/words`, {
      method: 'POST',
      body: JSON.stringify(word),
    }),
  updateWord: (dictId: number, word: unknown) =>
    request<{ ok: boolean }>(`/dictionaries/${dictId}/words`, {
      method: 'PUT',
      body: JSON.stringify(word),
    }),
  deleteWord: (dictId: number, wordId: number) =>
    request<{ ok: boolean }>(`/dictionaries/${dictId}/words`, {
      method: 'DELETE',
      body: JSON.stringify({ id: wordId }),
    }),
}

// ========== DICT MANAGEMENT ==========

export const dictManagementApi = {
  settings: () => request<{ settings: unknown[] }>('/dict-management/settings'),
  toggleSource: (source: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/dict-management/settings/${encodeURIComponent(source)}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
  stats: () => request<{ stats: unknown[] }>('/dict-management/stats'),
  groups: () => request<{ groups: unknown[] }>('/dict-management/groups'),
  createGroup: (name: string) =>
    request<{ id: number }>('/dict-management/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
}

// ========== PATTERN ==========

export const patternApi = {
  search: (pattern: string, sources: string) =>
    request<{ results: unknown[] }>(`/pattern/search?pattern=${encodeURIComponent(pattern)}&sources=${encodeURIComponent(sources)}`),
  sources: () => request<{ sources: unknown[] }>('/pattern/sources'),
}

// ========== LOCUTIONS ==========

export const locutionsApi = {
  search: (params: string) => request<{ locutions: unknown[] }>(`/locutions?${params}`),
}

// ========== MEMOS ==========

export const memosApi = {
  list: (search?: string) =>
    request<{ memos: unknown[] }>(`/memos${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  create: (memo: unknown) =>
    request<{ id: number }>('/memos', { method: 'POST', body: JSON.stringify(memo) }),
  update: (id: number, memo: unknown) =>
    request<{ ok: boolean }>(`/memos/${id}`, { method: 'PUT', body: JSON.stringify(memo) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/memos/${id}`, { method: 'DELETE' }),
}

// ========== GRID MANAGEMENT ==========

export const gridManagementApi = {
  list: () => request<{ grids: unknown[] }>('/grid-management'),
  updateMeta: (name: string, meta: unknown) =>
    request<{ ok: boolean }>(`/grid-management/${encodeURIComponent(name)}/meta`, {
      method: 'PUT',
      body: JSON.stringify(meta),
    }),
}

// ========== SITE ==========

export const siteApi = {
  grilles: () => request<{ online: unknown[]; offline: unknown[] }>('/site/grilles'),
  apply: (grids: unknown[]) =>
    request<{ ok: boolean }>('/site/apply', {
      method: 'POST',
      body: JSON.stringify({ grids }),
    }),
}
