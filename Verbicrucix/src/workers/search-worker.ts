/**
 * Web Worker for dictionary search queries.
 * Loads its own copy of the SQLite database so searches
 * never block the main thread.
 *
 * Uses a hybrid approach:
 * 1. First batch (INITIAL_CAP items per source/length) sent immediately
 * 2. After a short delay, remaining results streamed in paced chunks
 * This ensures instant initial display + eventually all results.
 */
import type { Database as SqlJsDatabase } from 'sql.js'

let db: SqlJsDatabase | null = null

// ========== INIT ==========

async function init() {
  const mod = await import('sql.js')
  const initSqlJs = typeof mod.default === 'function' ? mod.default : mod
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })

  const res = await fetch('/api/db')
  if (!res.ok) throw new Error('Failed to fetch DB')
  const buf = await res.arrayBuffer()
  db = new SQL.Database(new Uint8Array(buf))
  db.run('PRAGMA journal_mode = WAL')

  postMessage({ type: 'ready' })
}

// ========== QUERY HELPERS ==========

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  if (!db) return []
  const result = db.exec(sql, params as never[])
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj as T
  })
}

// ========== PATTERN UTILS ==========

function patternToRegex(pattern: string): RegExp {
  let regex = '^'
  for (const ch of pattern.toUpperCase()) {
    if (ch === '?') regex += '.'
    else if (ch === '/') regex += '.*'
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  regex += '$'
  return new RegExp(regex)
}

function patternPrefix(pattern: string): string | null {
  let prefix = ''
  for (const ch of pattern.toUpperCase()) {
    if (ch === '?' || ch === '/') break
    prefix += ch
  }
  return prefix.length > 0 ? prefix + '%' : null
}

// ========== SEARCH ==========

interface SearchResult {
  ortho: string
  ortho_upper: string
  definition: string
  categorie: string
  source: string
}

const EXTERNAL_DICTS = new Set(['sigles', 'communes', 'prenoms', 'toponymes', 'personnalites', 'wikipedia'])

// Initial batch: sent immediately, fills the visible viewport
const INITIAL_CAP = 200
// Streaming chunks: sent after delay, paced to keep main thread responsive
const STREAM_CHUNK = 500

let _enabledCache: string[] | null = null
function getEnabledSources(): string[] {
  if (_enabledCache) return _enabledCache
  _enabledCache = queryAll<{ source: string }>('SELECT source FROM dict_settings WHERE enabled = 1').map(r => r.source)
  return _enabledCache
}

// Current search generation — used to cancel stale streaming
let currentSearchGen = 0

function searchAndStream(
  id: number,
  pattern: string,
  validLengths: number[],
  onlySources: string[] | null
) {
  const gen = ++currentSearchGen

  let enabled = new Set(getEnabledSources())
  if (onlySources !== null) {
    const onlySet = new Set(onlySources)
    enabled = new Set([...enabled].filter(s => onlySet.has(s)))
  }

  const lengthsSorted = [...validLengths].sort((a, b) => b - a)
  const regexByLen = new Map<number, RegExp>()
  for (const len of lengthsSorted) {
    regexByLen.set(len, patternToRegex(pattern.slice(0, len)))
  }

  const minLen = Math.min(...lengthsSorted)
  const maxLen = Math.max(...lengthsSorted)
  const lenSet = new Set(lengthsSorted)
  const prefix = patternPrefix(pattern)

  // Collect ALL results (no cap — worker has its own memory)
  const results: Record<number, Record<string, SearchResult[]>> = {}
  for (const len of lengthsSorted) results[len] = {}
  const seen = new Set<string>()

  // Personal dictionaries
  const personalSources = [...enabled].filter(s => s.startsWith('personnel_'))
  if (personalSources.length > 0) {
    const dictIds = personalSources.map(s => parseInt(s.split('_')[1]))
    const ph = dictIds.map(() => '?').join(',')
    const params: unknown[] = [minLen, maxLen, ...dictIds]
    let sql = `SELECT dict_id, mot, mot_upper, definitions, categorie FROM dictionnaire_perso
      WHERE length(mot_upper) BETWEEN ? AND ? AND dict_id IN (${ph})`
    if (prefix) { sql += ' AND mot_upper LIKE ?'; params.push(prefix) }
    const rows = queryAll<{ dict_id: number; mot: string; mot_upper: string; definitions: string; categorie: string }>(sql, params)
    for (const row of rows) {
      const wordLen = row.mot_upper.length
      if (!lenSet.has(wordLen)) continue
      if (!regexByLen.get(wordLen)!.test(row.mot_upper) || seen.has(row.mot_upper)) continue
      seen.add(row.mot_upper)
      const defs = row.definitions ? JSON.parse(row.definitions) : []
      const src = `personnel_${row.dict_id}`
      if (!results[wordLen][src]) results[wordLen][src] = []
      results[wordLen][src].push({
        ortho: row.mot, ortho_upper: row.mot_upper,
        definition: defs[0] || '', categorie: row.categorie, source: src
      })
    }
  }

  // Lexique
  if (enabled.has('lexique')) {
    const params: unknown[] = [minLen, maxLen]
    let sql = `SELECT DISTINCT ortho, ortho_upper, lemme, cgram, nblettres FROM lexique
      WHERE nblettres BETWEEN ? AND ?`
    if (prefix) { sql += ' AND ortho_upper LIKE ?'; params.push(prefix) }
    const rows = queryAll<{ ortho: string; ortho_upper: string; lemme: string; cgram: string; nblettres: number }>(sql, params)
    for (const row of rows) {
      if (!lenSet.has(row.nblettres)) continue
      if (!regexByLen.get(row.nblettres)!.test(row.ortho_upper) || seen.has(row.ortho_upper)) continue
      seen.add(row.ortho_upper)
      if (!results[row.nblettres].lexique) results[row.nblettres].lexique = []
      results[row.nblettres].lexique.push({
        ortho: row.ortho, ortho_upper: row.ortho_upper,
        definition: row.lemme, categorie: row.cgram, source: 'lexique'
      })
    }
  }

  // External dictionaries
  const extSources = [...enabled].filter(s => EXTERNAL_DICTS.has(s))
  if (extSources.length > 0) {
    const srcPh = extSources.map(() => '?').join(',')
    const params: unknown[] = [minLen, maxLen, ...extSources]
    let sql = `SELECT mot, mot_grid, definition, categorie, source, nblettres FROM external_words
      WHERE nblettres BETWEEN ? AND ? AND source IN (${srcPh})`
    if (prefix) { sql += ' AND mot_grid LIKE ?'; params.push(prefix) }
    const rows = queryAll<{ mot: string; mot_grid: string; definition: string; categorie: string; source: string; nblettres: number }>(sql, params)
    for (const row of rows) {
      if (!lenSet.has(row.nblettres)) continue
      if (!regexByLen.get(row.nblettres)!.test(row.mot_grid) || seen.has(row.mot_grid)) continue
      seen.add(row.mot_grid)
      const src = row.source
      if (!results[row.nblettres][src]) results[row.nblettres][src] = []
      results[row.nblettres][src].push({
        ortho: row.mot, ortho_upper: row.mot_grid,
        definition: row.definition, categorie: row.categorie, source: src
      })
    }
  }

  // ---- PHASE 1: Send initial batch immediately (capped) ----
  const initialResults: Record<number, Record<string, SearchResult[]>> = {}
  const overflow: Record<number, Record<string, SearchResult[]>> = {}
  let hasOverflow = false

  for (const len of lengthsSorted) {
    initialResults[len] = {}
    overflow[len] = {}
    for (const [src, items] of Object.entries(results[len])) {
      if (items.length <= INITIAL_CAP) {
        initialResults[len][src] = items
      } else {
        initialResults[len][src] = items.slice(0, INITIAL_CAP)
        overflow[len][src] = items.slice(INITIAL_CAP)
        hasOverflow = true
      }
    }
  }

  // Send initial batch as a single message (small, fast structured clone)
  postMessage({ type: 'search-result', id, results: initialResults })

  if (!hasOverflow) {
    postMessage({ type: 'search-done', id })
    return
  }

  // ---- PHASE 2: Stream overflow after a delay, paced ----
  setTimeout(async () => {
    if (gen !== currentSearchGen) return // search was superseded

    let chunksSent = 0
    for (const len of lengthsSorted) {
      for (const [src, items] of Object.entries(overflow[len])) {
        if (!items || items.length === 0) continue
        for (let i = 0; i < items.length; i += STREAM_CHUNK) {
          if (gen !== currentSearchGen) return // cancelled
          postMessage({
            type: 'search-chunk', id, len,
            grouped: { [src]: items.slice(i, i + STREAM_CHUNK) },
          })
          chunksSent++
          // Yield every 2 chunks to let main thread breathe
          if (chunksSent % 2 === 0) {
            await new Promise(r => setTimeout(r, 4))
          }
        }
      }
    }

    if (gen === currentSearchGen) {
      postMessage({ type: 'search-done', id })
    }
  }, 300) // 300ms delay: let the initial render settle
}

// ========== MESSAGE HANDLER ==========

self.onmessage = (e: MessageEvent) => {
  const { type, id } = e.data

  if (type === 'search') {
    const { pattern, validLengths, sources } = e.data
    searchAndStream(id, pattern, validLengths, sources)
  }

  if (type === 'invalidate-cache') {
    _enabledCache = null
    postMessage({ type: 'cache-invalidated', id })
  }
}

// Auto-init on load
init().catch(err => {
  postMessage({ type: 'error', error: String(err) })
})
