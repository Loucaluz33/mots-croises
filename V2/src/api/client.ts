/**
 * API client — now backed by local sql.js instead of HTTP calls.
 * All methods remain async to preserve the same interface for components.
 */
import * as db from '@/db/queries'

// ========== GRIDS ==========

export const gridsApi = {
  list: async () => {
    const grids = db.listGrids()
    return { grids: grids.map(g => ({ nom: g.nom, terminee: !!g.terminee, date_creation: g.date_creation, date_modif: g.date_modif })) }
  },
  get: async (name: string) => {
    const grid = db.loadGrid(name)
    if (!grid) throw new Error(`Grid not found: ${name}`)
    return { grid: grid.json_data }
  },
  save: async (name: string, data: unknown) => {
    db.saveGrid(name, data)
    return { ok: true }
  },
  delete: async (name: string) => {
    db.deleteGrid(name)
    return { ok: true }
  },
}

// ========== SUGGESTIONS ==========

export const suggestionsApi = {
  search: async (pattern: string, sources: string) => {
    const srcArray = sources ? sources.split(',').filter(Boolean) : null
    const results = db.searchByPatternFlat(pattern, srcArray)
    return { results }
  },
}

// ========== DICTIONARIES ==========

export const dictionariesApi = {
  list: async () => {
    const dictionaries = db.getPersonalDicts()
    return { dictionaries }
  },
  create: async (name: string) => {
    const id = db.addPersonalDict(name)
    if (id === null) throw new Error('Dictionary already exists')
    return { id }
  },
  getWords: async (dictId: number, params: string) => {
    const urlParams = new URLSearchParams(params)
    const search = urlParams.get('search') || ''
    const limit = parseInt(urlParams.get('limit') || '500')
    const words = db.getPersonalWords(search, limit, dictId)
    return { words }
  },
  addWord: async (dictId: number, word: { mot: string; definitions?: string[]; categorie?: string; notes?: string }) => {
    const result = db.addPersonalWord(word.mot, word.definitions || [], word.categorie || '', word.notes || '', dictId)
    if (result === null) throw new Error('Word already exists')
    return { id: 0 }
  },
  updateWord: async (dictId: number, word: { mot: string; definitions?: string[]; categorie?: string; notes?: string; newMot?: string }) => {
    db.updatePersonalWord(word.mot, { definitions: word.definitions, categorie: word.categorie, notes: word.notes, newMot: word.newMot }, dictId)
    return { ok: true }
  },
  deleteWord: async (dictId: number, wordId: number | string) => {
    // wordId is actually mot (word text) in the personal dict context
    db.deletePersonalWord(String(wordId), dictId)
    return { ok: true }
  },
}

// ========== DICT MANAGEMENT ==========

export const dictManagementApi = {
  settings: async () => {
    const settings = db.getDictSettings()
    return { settings: Object.values(settings) }
  },
  toggleSource: async (source: string, enabled: boolean) => {
    db.setSourceEnabled(source, enabled)
    return { ok: true }
  },
  stats: async () => {
    const lexStats = db.getLexiqueStats()
    const sources = db.getAllSources()
    return { stats: { lexique: lexStats, sources } }
  },
  groups: async () => {
    const groups = db.getDictGroups()
    return { groups }
  },
  createGroup: async (name: string) => {
    const id = db.addDictGroup(name)
    return { id }
  },
}

// ========== PATTERN ==========

export const patternApi = {
  search: async (pattern: string, sources: string) => {
    const srcArray = sources ? sources.split(',').filter(Boolean) : null
    const results = db.searchByPatternFlat(pattern, srcArray)
    return { results }
  },
  sources: async () => {
    const sources = db.getAllSources()
    return { sources }
  },
}

// ========== LOCUTIONS ==========

export const locutionsApi = {
  search: async (params: string) => {
    const urlParams = new URLSearchParams(params)
    const keyword = urlParams.get('keyword') || urlParams.get('search') || ''
    const limit = parseInt(urlParams.get('limit') || '200')
    const offset = parseInt(urlParams.get('offset') || '0')
    const categoriesParam = urlParams.get('categories')
    const categories = categoriesParam ? categoriesParam.split(',') : null
    const { rows, total } = db.searchLocutions(keyword, limit, offset, categories)
    return { locutions: rows, total }
  },
}

// ========== MEMOS ==========

export const memosApi = {
  list: async (search?: string) => {
    const memos = db.getMemos(search || '')
    return { memos }
  },
  create: async (memo: { mot?: string; dict_target?: string; categorie?: string; note?: string }) => {
    const id = db.addMemo(memo.mot || '', memo.dict_target || '', memo.categorie || '', memo.note || '')
    return { id }
  },
  update: async (id: number, memo: { mot?: string; dict_target?: string; categorie?: string; note?: string }) => {
    db.updateMemo(id, memo.mot || '', memo.dict_target || '', memo.categorie || '', memo.note || '')
    return { ok: true }
  },
  delete: async (id: number) => {
    db.deleteMemo(id)
    return { ok: true }
  },
}

// ========== GRID MANAGEMENT ==========

export const gridManagementApi = {
  list: async () => {
    const grids = db.listGridsFull()
    return {
      grids: grids.map(g => ({
        nom: g.nom,
        json_data: g.json_data,
        terminee: !!g.terminee,
        date_creation: g.date_creation,
        date_modif: g.date_modif,
      }))
    }
  },
  updateMeta: async (name: string, meta: { terminee?: boolean }) => {
    const grid = db.loadGrid(name)
    if (grid) {
      db.saveGrid(name, grid.json_data, meta.terminee)
    }
    return { ok: true }
  },
}

// ========== SITE (stub — no backend needed) ==========

export const siteApi = {
  grilles: async () => ({ online: [], offline: [] }),
  apply: async () => ({ ok: true }),
}
