/**
 * All SQLite queries for Verbicrucix.
 * Uses sql.js (WASM) via engine.ts instead of better-sqlite3.
 */
import { queryAll, queryOne, run, exec, lastInsertRowId } from './engine'

// ========== CONSTANTS ==========

export const EXTERNAL_DICTS: Record<string, { label: string; description: string }> = {
  sigles: { label: 'Sigles & Acronymes', description: 'Sigles français (Wiktionnaire + Wikipedia)' },
  communes: { label: 'Communes de France', description: 'Toutes les communes françaises (data.gouv.fr)' },
  prenoms: { label: 'Prénoms', description: 'Prénoms donnés en France depuis 1900 (INSEE)' },
  toponymes: { label: 'Toponymes (GeoNames)', description: 'Lieux géographiques de France' },
  personnalites: { label: 'Personnalités', description: 'Personnalités françaises et internationales (Wikidata)' },
  wikipedia: { label: 'Wikipedia FR', description: 'Tous les mots-titres + noms de famille (Wikipedia FR)' },
}

// ========== UTILITIES ==========

export function stripAccents(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeForGrid(text: string): string {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '')
}

function normalizeForSearch(text: string): string {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '')
}

// ========== PATTERN MATCHING ==========

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

function patternToLike(pattern: string): string | null {
  let like = ''
  let hasKnown = false
  for (const ch of pattern.toUpperCase()) {
    if (ch === '?') {
      like += '_'
    } else if (ch === '/') {
      like += '%'
    } else {
      if (ch === '%' || ch === '_') like += '\\' + ch
      else like += ch
      hasKnown = true
    }
  }
  return hasKnown ? like : null
}

function patternHasWildcard(pattern: string): boolean {
  return pattern.includes('/')
}

// ========== INIT ==========

export function initDb(): void {
  // Lexique 3
  exec(`
    CREATE TABLE IF NOT EXISTS lexique (
      id INTEGER PRIMARY KEY,
      ortho TEXT NOT NULL,
      lemme TEXT NOT NULL,
      cgram TEXT,
      genre TEXT,
      nombre TEXT,
      infover TEXT,
      nblettres INTEGER,
      ortho_upper TEXT NOT NULL
    )
  `)
  exec('CREATE INDEX IF NOT EXISTS idx_lexique_ortho ON lexique(ortho_upper)')
  exec('CREATE INDEX IF NOT EXISTS idx_lexique_lemme ON lexique(lemme)')
  exec('CREATE INDEX IF NOT EXISTS idx_lexique_nblettres ON lexique(nblettres)')

  // Dictionnaires personnels
  exec(`
    CREATE TABLE IF NOT EXISTS personal_dicts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      date_creation TEXT DEFAULT (date('now'))
    )
  `)
  const existingPd = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM personal_dicts')
  if (existingPd && existingPd.cnt === 0) {
    run("INSERT INTO personal_dicts (id, name) VALUES (1, 'dictionnaire_personnel')")
  }

  // Dictionnaire personnel
  exec(`
    CREATE TABLE IF NOT EXISTS dictionnaire_perso (
      id INTEGER PRIMARY KEY,
      dict_id INTEGER NOT NULL DEFAULT 1,
      mot TEXT NOT NULL,
      mot_upper TEXT NOT NULL,
      definitions TEXT DEFAULT '[]',
      categorie TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      date_ajout TEXT DEFAULT (date('now')),
      date_modif TEXT DEFAULT (date('now')),
      FOREIGN KEY (dict_id) REFERENCES personal_dicts(id) ON DELETE CASCADE,
      UNIQUE(dict_id, mot_upper)
    )
  `)
  exec('CREATE INDEX IF NOT EXISTS idx_perso_mot ON dictionnaire_perso(mot_upper)')
  exec('CREATE INDEX IF NOT EXISTS idx_perso_dict ON dictionnaire_perso(dict_id)')

  // External words
  exec(`
    CREATE TABLE IF NOT EXISTS external_words (
      id INTEGER PRIMARY KEY,
      mot TEXT NOT NULL,
      mot_upper TEXT NOT NULL,
      mot_grid TEXT NOT NULL,
      definition TEXT DEFAULT '',
      categorie TEXT DEFAULT '',
      source TEXT NOT NULL,
      nblettres INTEGER
    )
  `)
  exec('CREATE INDEX IF NOT EXISTS idx_ext_source ON external_words(source)')
  exec('CREATE INDEX IF NOT EXISTS idx_ext_grid ON external_words(mot_grid)')
  exec('CREATE INDEX IF NOT EXISTS idx_ext_nblettres ON external_words(nblettres, source)')

  // Dict settings
  exec(`
    CREATE TABLE IF NOT EXISTS dict_settings (
      source TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      word_count INTEGER DEFAULT 0,
      custom_label TEXT DEFAULT ''
    )
  `)
  run("INSERT OR IGNORE INTO dict_settings (source, enabled) VALUES ('lexique', 1)")
  const pds = queryAll<{ id: number }>('SELECT id FROM personal_dicts')
  for (const pd of pds) {
    run('INSERT OR IGNORE INTO dict_settings (source, enabled) VALUES (?, 1)', [`personnel_${pd.id}`])
  }
  for (const source of Object.keys(EXTERNAL_DICTS)) {
    run('INSERT OR IGNORE INTO dict_settings (source, enabled, word_count) VALUES (?, 0, 0)', [source])
  }

  // Filter groups
  exec(`
    CREATE TABLE IF NOT EXISTS dict_groups (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0
    )
  `)
  exec(`
    CREATE TABLE IF NOT EXISTS dict_group_sources (
      group_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (group_id, source),
      FOREIGN KEY (group_id) REFERENCES dict_groups(id) ON DELETE CASCADE
    )
  `)

  const existingGroups = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM dict_groups')
  if (existingGroups && existingGroups.cnt === 0) {
    run("INSERT INTO dict_groups (name, position) VALUES ('Dicos principaux', 0)")
    const gid1 = lastInsertRowId()
    run("INSERT INTO dict_group_sources (group_id, source) VALUES (?, 'lexique')", [gid1])
    for (const pd of pds) {
      run('INSERT INTO dict_group_sources (group_id, source) VALUES (?, ?)', [gid1, `personnel_${pd.id}`])
    }
    run("INSERT INTO dict_groups (name, position) VALUES ('Autres', 1)")
    const gid2 = lastInsertRowId()
    for (const src of Object.keys(EXTERNAL_DICTS)) {
      run('INSERT INTO dict_group_sources (group_id, source) VALUES (?, ?)', [gid2, src])
    }
  }

  // Locutions
  exec(`
    CREATE TABLE IF NOT EXISTS locutions (
      id INTEGER PRIMARY KEY,
      expression TEXT NOT NULL,
      expression_upper TEXT NOT NULL,
      categorie TEXT DEFAULT '',
      definition TEXT DEFAULT ''
    )
  `)
  exec('CREATE INDEX IF NOT EXISTS idx_locutions_upper ON locutions(expression_upper)')

  // Mémos
  exec(`
    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY,
      mot TEXT DEFAULT '',
      dict_target TEXT DEFAULT '',
      categorie TEXT DEFAULT '',
      note TEXT DEFAULT '',
      date_creation TEXT DEFAULT (datetime('now')),
      date_modif TEXT DEFAULT (datetime('now'))
    )
  `)

  // Grilles
  exec(`
    CREATE TABLE IF NOT EXISTS grilles (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL,
      json_data TEXT NOT NULL,
      terminee INTEGER DEFAULT 0,
      auteur TEXT DEFAULT '',
      difficulte TEXT DEFAULT '',
      themes TEXT DEFAULT '',
      nom_online TEXT DEFAULT '',
      date_creation TEXT DEFAULT (datetime('now')),
      date_modif TEXT DEFAULT (datetime('now'))
    )
  `)

  // Migrations for existing databases
  try {
    run("SELECT auteur FROM grilles LIMIT 1")
  } catch {
    run("ALTER TABLE grilles ADD COLUMN auteur TEXT DEFAULT ''")
  }
  try {
    run("SELECT difficulte FROM grilles LIMIT 1")
  } catch {
    run("ALTER TABLE grilles ADD COLUMN difficulte TEXT DEFAULT ''")
  }
  try {
    run("SELECT themes FROM grilles LIMIT 1")
  } catch {
    run("ALTER TABLE grilles ADD COLUMN themes TEXT DEFAULT ''")
  }
  try {
    run("SELECT nom_online FROM grilles LIMIT 1")
  } catch {
    run("ALTER TABLE grilles ADD COLUMN nom_online TEXT DEFAULT ''")
  }
}

// ========== SOURCES & SETTINGS ==========

let _enabledSourcesCache: string[] | null = null

export function getEnabledSources(): string[] {
  if (_enabledSourcesCache) return _enabledSourcesCache
  _enabledSourcesCache = queryAll<{ source: string }>('SELECT source FROM dict_settings WHERE enabled = 1').map(r => r.source)
  return _enabledSourcesCache
}

export function invalidateEnabledSourcesCache(): void {
  _enabledSourcesCache = null
}

export function setSourceEnabled(source: string, enabled: boolean): void {
  run(`
    INSERT OR REPLACE INTO dict_settings (source, enabled, word_count, custom_label)
    VALUES (?, ?, COALESCE((SELECT word_count FROM dict_settings WHERE source = ?), 0),
                  COALESCE((SELECT custom_label FROM dict_settings WHERE source = ?), ''))
  `, [source, enabled ? 1 : 0, source, source])
  invalidateEnabledSourcesCache()
}

export function getDictSettings(): Record<string, { source: string; enabled: number; word_count: number; custom_label: string }> {
  const rows = queryAll<{ source: string; enabled: number; word_count: number; custom_label: string }>('SELECT * FROM dict_settings')
  const result: Record<string, typeof rows[0]> = {}
  for (const r of rows) result[r.source] = r
  return result
}

export function renameExternalDict(source: string, label: string): void {
  run('UPDATE dict_settings SET custom_label = ? WHERE source = ?', [label, source])
}

// ========== GROUPS ==========

export function getDictGroups(): { id: number; name: string; position: number; sources: string[] }[] {
  const groups = queryAll<{ id: number; name: string; position: number }>('SELECT * FROM dict_groups ORDER BY position')
  return groups.map(g => {
    const sources = queryAll<{ source: string }>('SELECT source FROM dict_group_sources WHERE group_id = ?', [g.id])
    return { id: g.id, name: g.name, position: g.position, sources: sources.map(s => s.source) }
  })
}

export function addDictGroup(name: string, sources: string[] = []): number {
  const maxPos = queryOne<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM dict_groups')
  run('INSERT INTO dict_groups (name, position) VALUES (?, ?)', [name, (maxPos?.m ?? -1) + 1])
  const gid = lastInsertRowId()
  for (const src of sources) {
    run('INSERT OR IGNORE INTO dict_group_sources (group_id, source) VALUES (?, ?)', [gid, src])
  }
  return gid
}

export function updateDictGroup(groupId: number, name: string | null, sources: string[] | null): void {
  if (name !== undefined && name !== null) {
    run('UPDATE dict_groups SET name = ? WHERE id = ?', [name, groupId])
  }
  if (sources !== undefined && sources !== null) {
    run('DELETE FROM dict_group_sources WHERE group_id = ?', [groupId])
    for (const src of sources) {
      run('INSERT INTO dict_group_sources (group_id, source) VALUES (?, ?)', [groupId, src])
    }
  }
}

export function deleteDictGroup(groupId: number): void {
  run('DELETE FROM dict_group_sources WHERE group_id = ?', [groupId])
  run('DELETE FROM dict_groups WHERE id = ?', [groupId])
}

// ========== PATTERN SEARCH ==========

/**
 * Extract the leading known-letter prefix from a pattern for use as a SQL LIKE prefix filter.
 * "A??N????" → "A%" (only first letter is usable as prefix)
 * "AB?N????" → "AB%"
 * "???N????" → null (no known prefix)
 */
function patternPrefix(pattern: string): string | null {
  let prefix = ''
  for (const ch of pattern.toUpperCase()) {
    if (ch === '?' || ch === '/') break
    prefix += ch
  }
  return prefix.length > 0 ? prefix + '%' : null
}

/**
 * Search all lengths at once. Returns results grouped by length, then by source.
 * One SQL query per table type (personal, lexique, external) with:
 * - nblettres BETWEEN min AND max (index-friendly range scan)
 * - Optional LIKE prefix filter for additional selectivity
 * - JS regex post-filter per length for exact matching
 */
export function searchAllLengths(
  pattern: string,
  validLengths: number[],
  onlySources: string[] | null = null
): Record<number, Record<string, SearchResult[]>> {
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

  const results: Record<number, Record<string, SearchResult[]>> = {}
  for (const len of lengthsSorted) results[len] = {}
  const seen = new Set<string>()

  // ---- Personal dictionaries ----
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

  // ---- Lexique ----
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

  // ---- External dictionaries ----
  const extSources = [...enabled].filter(s => s in EXTERNAL_DICTS)
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

  return results
}

/** Legacy single-length search (still used by pattern search tab) */
export function searchByPatternGrouped(pattern: string, onlySources: string[] | null = null): Record<string, SearchResult[]> {
  const length = pattern.replace(/\//g, '').length
  const byLen = searchAllLengths(pattern, [length], onlySources)
  return byLen[length] || {}
}

export interface SearchResult {
  ortho: string
  ortho_upper: string
  definition: string
  categorie: string
  source: string
}

export function searchByPatternFlat(pattern: string, sources: string[] | null = null): SearchResult[] {
  const grouped = searchByPatternGrouped(pattern, sources)
  const results: SearchResult[] = []
  for (const words of Object.values(grouped)) {
    for (const w of words) results.push(w)
  }
  results.sort((a, b) => a.ortho_upper.localeCompare(b.ortho_upper))
  return results
}

export function getAllSources(): { id: string; label: string; count: number }[] {
  const sources: { id: string; label: string; count: number }[] = []
  // Personal dicts
  const dicts = queryAll<{ id: number; name: string }>('SELECT id, name FROM personal_dicts ORDER BY name')
  for (const pd of dicts) {
    const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM dictionnaire_perso WHERE dict_id = ?', [pd.id])
    sources.push({ id: `personnel_${pd.id}`, label: pd.name, count: row?.cnt ?? 0 })
  }
  // Lexique
  const lexRow = queryOne<{ cnt: number }>('SELECT COUNT(DISTINCT ortho_upper) as cnt FROM lexique')
  if (lexRow && lexRow.cnt > 0) sources.push({ id: 'lexique', label: 'Lexique 3', count: lexRow.cnt })
  // External
  for (const [key, info] of Object.entries(EXTERNAL_DICTS)) {
    const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM external_words WHERE source = ?', [key])
    if (row && row.cnt > 0) sources.push({ id: key, label: info.label, count: row.cnt })
  }
  return sources
}

// ========== DERIVED FORMS ==========

export function getDerivedForms(lemme: string): { ortho: string; cgram: string; genre: string; nombre: string; infover: string }[] {
  return queryAll('SELECT DISTINCT ortho, cgram, genre, nombre, infover FROM lexique WHERE lemme = ? ORDER BY ortho', [lemme])
}

// ========== PERSONAL DICTIONARIES ==========

export function getPersonalDicts(): { id: number; name: string; date_creation: string }[] {
  return queryAll('SELECT * FROM personal_dicts ORDER BY id')
}

export function addPersonalDict(name: string): number | null {
  try {
    run('INSERT INTO personal_dicts (name) VALUES (?)', [name])
    const dictId = lastInsertRowId()
    const src = `personnel_${dictId}`
    run("INSERT OR IGNORE INTO dict_settings (source, enabled) VALUES (?, 1)", [src])
    const firstGroup = queryOne<{ id: number }>('SELECT id FROM dict_groups ORDER BY position LIMIT 1')
    if (firstGroup) {
      run('INSERT OR IGNORE INTO dict_group_sources (group_id, source) VALUES (?, ?)', [firstGroup.id, src])
    }
    return dictId
  } catch {
    return null
  }
}

export function renamePersonalDict(dictId: number, newName: string): boolean {
  try {
    run('UPDATE personal_dicts SET name = ? WHERE id = ?', [newName, dictId])
    return true
  } catch {
    return false
  }
}

export function deletePersonalDict(dictId: number): boolean {
  const src = `personnel_${dictId}`
  run('DELETE FROM dictionnaire_perso WHERE dict_id = ?', [dictId])
  run('DELETE FROM personal_dicts WHERE id = ?', [dictId])
  run('DELETE FROM dict_settings WHERE source = ?', [src])
  run('DELETE FROM dict_group_sources WHERE source = ?', [src])
  return true
}

export function getPersonalDictName(dictId: number): string | null {
  const row = queryOne<{ name: string }>('SELECT name FROM personal_dicts WHERE id = ?', [dictId])
  return row?.name ?? null
}

// ========== PERSONAL WORDS ==========

export function addPersonalWord(mot: string, definitions: string[] = [], categorie = '', notes = '', dictId = 1): boolean | null {
  const motNorm = normalizeForGrid(mot)
  const catNorm = normalizeForGrid(categorie)
  const defsJson = JSON.stringify(definitions)
  try {
    run(
      'INSERT INTO dictionnaire_perso (dict_id, mot, mot_upper, definitions, categorie, notes) VALUES (?,?,?,?,?,?)',
      [dictId, motNorm, motNorm, defsJson, catNorm, notes]
    )
    return true
  } catch {
    return null
  }
}

export function updatePersonalWord(
  mot: string,
  opts: { definitions?: string[]; categorie?: string; notes?: string; newMot?: string } = {},
  dictId = 1
): void {
  const motUpper = normalizeForGrid(mot)
  const updates: string[] = []
  const params: unknown[] = []

  if (opts.definitions !== undefined) { updates.push('definitions = ?'); params.push(JSON.stringify(opts.definitions)) }
  if (opts.categorie !== undefined) { updates.push('categorie = ?'); params.push(normalizeForGrid(opts.categorie)) }
  if (opts.notes !== undefined) { updates.push('notes = ?'); params.push(opts.notes) }
  if (opts.newMot !== undefined) {
    const newMotNorm = normalizeForGrid(opts.newMot)
    updates.push('mot = ?'); params.push(newMotNorm)
    updates.push('mot_upper = ?'); params.push(newMotNorm)
  }
  updates.push("date_modif = date('now')")
  params.push(dictId, motUpper)

  run(`UPDATE dictionnaire_perso SET ${updates.join(', ')} WHERE dict_id = ? AND mot_upper = ?`, params)
}

export function deletePersonalWord(mot: string, dictId = 1): void {
  run('DELETE FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper = ?', [dictId, normalizeForSearch(mot)])
}

export function getCategories(): { categorie: string; cnt: number }[] {
  return queryAll("SELECT categorie, COUNT(*) as cnt FROM dictionnaire_perso WHERE categorie != '' GROUP BY categorie ORDER BY cnt DESC")
}

export function getPersonalWords(search = '', limit = 500, dictId = 1): Record<string, unknown>[] {
  if (search) {
    const searchUpper = normalizeForSearch(search)
    return queryAll(
      'SELECT * FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper LIKE ? ORDER BY mot_upper LIMIT ?',
      [dictId, `%${searchUpper}%`, limit]
    )
  }
  return queryAll(
    'SELECT * FROM dictionnaire_perso WHERE dict_id = ? ORDER BY mot_upper LIMIT ?',
    [dictId, limit]
  )
}

export function getPersonalWord(mot: string, dictId: number | null = null): Record<string, unknown> | null {
  const motUpper = normalizeForSearch(mot)
  if (dictId !== null) {
    return queryOne('SELECT * FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper = ?', [dictId, motUpper])
  }
  return queryOne('SELECT * FROM dictionnaire_perso WHERE mot_upper = ? ORDER BY dict_id LIMIT 1', [motUpper])
}

// ========== BROWSE DICTIONARY ==========

interface BrowseEntry { mot: string; definition: string; categorie: string }

export function browseDictionary(source: string, search = '', limit = 500): { all?: BrowseEntry[]; starts?: BrowseEntry[]; contains?: BrowseEntry[] } {
  const searchUpper = search ? normalizeForGrid(search) : ''

  if (!searchUpper) {
    if (source.startsWith('personnel_')) {
      const dictId = parseInt(source.split('_')[1])
      const rows = queryAll<{ mot_upper: string; definitions: string; categorie: string }>(
        'SELECT mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id = ? ORDER BY mot_upper LIMIT ?', [dictId, limit]
      )
      return { all: rows.map(r => ({ mot: r.mot_upper, definition: (r.definitions ? JSON.parse(r.definitions) : [])[0] || '', categorie: r.categorie })) }
    } else if (source === 'lexique') {
      const rows = queryAll<{ ortho_upper: string; lemme: string; cgram: string }>(
        'SELECT DISTINCT ortho_upper, lemme, cgram FROM lexique ORDER BY ortho_upper LIMIT ?', [limit]
      )
      return { all: rows.map(r => ({ mot: r.ortho_upper, definition: r.lemme, categorie: r.cgram })) }
    } else {
      const rows = queryAll<{ mot_grid: string; definition: string; categorie: string }>(
        'SELECT DISTINCT mot_grid, definition, categorie FROM external_words WHERE source = ? ORDER BY mot_grid LIMIT ?', [source, limit]
      )
      return { all: rows.map(r => ({ mot: r.mot_grid, definition: r.definition, categorie: r.categorie })) }
    }
  }

  const startsLike = searchUpper + '%'
  const containsLike = '%' + searchUpper + '%'

  if (source.startsWith('personnel_')) {
    const dictId = parseInt(source.split('_')[1])
    const startsRows = queryAll<{ mot_upper: string; definitions: string; categorie: string }>(
      'SELECT mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper LIKE ? ORDER BY mot_upper LIMIT ?',
      [dictId, startsLike, limit]
    )
    const containsRows = queryAll<{ mot_upper: string; definitions: string; categorie: string }>(
      'SELECT mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper LIKE ? AND mot_upper NOT LIKE ? ORDER BY mot_upper LIMIT ?',
      [dictId, containsLike, startsLike, limit]
    )
    const toEntry = (r: { mot_upper: string; definitions: string; categorie: string }) => ({
      mot: r.mot_upper, definition: (r.definitions ? JSON.parse(r.definitions) : [])[0] || '', categorie: r.categorie
    })
    return { starts: startsRows.map(toEntry), contains: containsRows.map(toEntry) }
  } else if (source === 'lexique') {
    const startsRows = queryAll<{ ortho_upper: string; lemme: string; cgram: string }>(
      'SELECT DISTINCT ortho_upper, lemme, cgram FROM lexique WHERE ortho_upper LIKE ? ORDER BY ortho_upper LIMIT ?',
      [startsLike, limit]
    )
    const containsRows = queryAll<{ ortho_upper: string; lemme: string; cgram: string }>(
      'SELECT DISTINCT ortho_upper, lemme, cgram FROM lexique WHERE ortho_upper LIKE ? AND ortho_upper NOT LIKE ? ORDER BY ortho_upper LIMIT ?',
      [containsLike, startsLike, limit]
    )
    const toEntry = (r: { ortho_upper: string; lemme: string; cgram: string }) => ({
      mot: r.ortho_upper, definition: r.lemme, categorie: r.cgram
    })
    return { starts: startsRows.map(toEntry), contains: containsRows.map(toEntry) }
  } else {
    const startsRows = queryAll<{ mot_grid: string; definition: string; categorie: string }>(
      'SELECT DISTINCT mot_grid, definition, categorie FROM external_words WHERE source = ? AND mot_grid LIKE ? ORDER BY mot_grid LIMIT ?',
      [source, startsLike, limit]
    )
    const containsRows = queryAll<{ mot_grid: string; definition: string; categorie: string }>(
      'SELECT DISTINCT mot_grid, definition, categorie FROM external_words WHERE source = ? AND mot_grid LIKE ? AND mot_grid NOT LIKE ? ORDER BY mot_grid LIMIT ?',
      [source, containsLike, startsLike, limit]
    )
    const toEntry = (r: { mot_grid: string; definition: string; categorie: string }) => ({
      mot: r.mot_grid, definition: r.definition, categorie: r.categorie
    })
    return { starts: startsRows.map(toEntry), contains: containsRows.map(toEntry) }
  }
}

// ========== GRIDS ==========

export interface GridRow {
  id: number
  nom: string
  json_data: unknown
  terminee: number
  auteur: string
  difficulte: string
  themes: string
  nom_online: string
  date_creation: string
  date_modif: string
}

export interface GridMeta {
  nom: string
  auteur: string
  difficulte: string
  themes: string
  nom_online: string
}

/** Save grid by ID (update) or create new (id=null). Returns the grid ID. */
export function saveGridById(id: number | null, meta: GridMeta, jsonData: unknown, terminee = false): number {
  const jsonStr = JSON.stringify(jsonData)
  if (id !== null) {
    run("UPDATE grilles SET nom = ?, auteur = ?, difficulte = ?, themes = ?, nom_online = ?, json_data = ?, terminee = ?, date_modif = datetime('now') WHERE id = ?",
      [meta.nom, meta.auteur, meta.difficulte, meta.themes, meta.nom_online, jsonStr, terminee ? 1 : 0, id])
    return id
  } else {
    run('INSERT INTO grilles (nom, auteur, difficulte, themes, nom_online, json_data, terminee) VALUES (?,?,?,?,?,?,?)',
      [meta.nom, meta.auteur, meta.difficulte, meta.themes, meta.nom_online, jsonStr, terminee ? 1 : 0])
    return lastInsertRowId()
  }
}

/** Legacy save by name (used by old code paths) */
export function saveGrid(nom: string, jsonData: unknown, terminee = false): void {
  const existing = queryOne<{ id: number }>('SELECT id FROM grilles WHERE nom = ?', [nom])
  const jsonStr = JSON.stringify(jsonData)
  if (existing) {
    run("UPDATE grilles SET json_data = ?, terminee = ?, date_modif = datetime('now') WHERE nom = ?",
      [jsonStr, terminee ? 1 : 0, nom])
  } else {
    run('INSERT INTO grilles (nom, json_data, terminee) VALUES (?,?,?)',
      [nom, jsonStr, terminee ? 1 : 0])
  }
}

export function loadGridById(id: number): GridRow | null {
  const row = queryOne<{ id: number; nom: string; json_data: string; terminee: number; auteur: string; date_creation: string; date_modif: string }>(
    'SELECT * FROM grilles WHERE id = ?', [id]
  )
  if (!row) return null
  return { ...row, json_data: JSON.parse(row.json_data) }
}

export function loadGrid(nom: string): GridRow | null {
  const row = queryOne<{ id: number; nom: string; json_data: string; terminee: number; auteur: string; date_creation: string; date_modif: string }>(
    'SELECT * FROM grilles WHERE nom = ?', [nom]
  )
  if (!row) return null
  return { ...row, json_data: JSON.parse(row.json_data) }
}

export function listGrids(): { id: number; nom: string; auteur: string; difficulte: string; themes: string; nom_online: string; terminee: number; date_creation: string; date_modif: string }[] {
  return queryAll('SELECT id, nom, auteur, difficulte, themes, nom_online, terminee, date_creation, date_modif FROM grilles ORDER BY date_modif DESC')
}

export function listGridsFull(): { id: number; nom: string; json_data: string; auteur: string; difficulte: string; themes: string; nom_online: string; terminee: number; date_creation: string; date_modif: string }[] {
  return queryAll('SELECT id, nom, json_data, auteur, difficulte, themes, nom_online, terminee, date_creation, date_modif FROM grilles ORDER BY date_modif DESC')
}

export function deleteGrid(nom: string): void {
  run('DELETE FROM grilles WHERE nom = ?', [nom])
}

export function deleteGridById(id: number): void {
  run('DELETE FROM grilles WHERE id = ?', [id])
}

export function updateGridMeta(id: number, meta: GridMeta): void {
  run("UPDATE grilles SET nom = ?, auteur = ?, difficulte = ?, themes = ?, nom_online = ?, date_modif = datetime('now') WHERE id = ?",
    [meta.nom, meta.auteur, meta.difficulte, meta.themes, meta.nom_online, id])
}

// ========== MEMOS ==========

export function getMemos(search = ''): Record<string, unknown>[] {
  if (!search) {
    return queryAll('SELECT * FROM memos ORDER BY date_modif DESC')
  }
  const q = `%${search.toUpperCase()}%`
  return queryAll(
    "SELECT * FROM memos WHERE UPPER(mot) LIKE ? OR UPPER(note) LIKE ? ORDER BY date_modif DESC",
    [q, q]
  )
}

export function addMemo(mot: string, dictTarget: string, categorie: string, note: string): number {
  run("INSERT INTO memos (mot, dict_target, categorie, note) VALUES (?, ?, ?, ?)",
    [mot || '', dictTarget || '', categorie || '', note || ''])
  return lastInsertRowId()
}

export function updateMemo(id: number, mot: string, dictTarget: string, categorie: string, note: string): void {
  run(
    "UPDATE memos SET mot = ?, dict_target = ?, categorie = ?, note = ?, date_modif = datetime('now') WHERE id = ?",
    [mot || '', dictTarget || '', categorie || '', note || '', id]
  )
}

export function deleteMemo(id: number): void {
  run('DELETE FROM memos WHERE id = ?', [id])
}

// ========== STATISTICS ==========

export function getLexiqueStats(): { total_entries: number; distinct_words: number } {
  const total = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM lexique')
  const distinct = queryOne<{ cnt: number }>('SELECT COUNT(DISTINCT ortho_upper) as cnt FROM lexique')
  return { total_entries: total?.cnt ?? 0, distinct_words: distinct?.cnt ?? 0 }
}

export function getPersonalStats(dictId: number | null = null): { total_words: number } {
  const row = dictId !== null
    ? queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM dictionnaire_perso WHERE dict_id = ?', [dictId])
    : queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM dictionnaire_perso')
  return { total_words: row?.cnt ?? 0 }
}

export function getExternalCount(source: string): number {
  const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM external_words WHERE source = ?', [source])
  return row?.cnt ?? 0
}

export function updateDictCount(source: string, count: number): void {
  run('UPDATE dict_settings SET word_count = ? WHERE source = ?', [count, source])
}

// ========== LOCUTIONS ==========

export function getLocutionsCount(): number {
  const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM locutions')
  return row?.cnt ?? 0
}

function parseLocutionTerm(term: string): { core: string; mode: 'exact' | 'prefix' | 'suffix' | 'contains' } | null {
  const startsSlash = term.startsWith('/')
  const endsSlash = term.endsWith('/')
  let core = term
  if (startsSlash) core = core.slice(1)
  if (endsSlash) core = core.slice(0, -1)
  if (!core) return null

  let mode: 'exact' | 'prefix' | 'suffix' | 'contains' = 'exact'
  if (startsSlash && endsSlash) mode = 'contains'
  else if (endsSlash) mode = 'prefix'
  else if (startsSlash) mode = 'suffix'
  return { core: stripAccents(core.toUpperCase()), mode }
}

function buildLocutionLikeCondition(parsed: { core: string; mode: string }, column: string): { sql: string; params: string[] } {
  const c = parsed.core
  switch (parsed.mode) {
    case 'exact':
      return { sql: `(${column} LIKE ? OR ${column} LIKE ? OR ${column} LIKE ? OR ${column} = ?)`, params: [`% ${c} %`, `${c} %`, `% ${c}`, c] }
    case 'prefix':
      return { sql: `(${column} LIKE ? OR ${column} LIKE ?)`, params: [`% ${c}%`, `${c}%`] }
    case 'suffix':
      return { sql: `(${column} LIKE ? OR ${column} LIKE ?)`, params: [`%${c} %`, `%${c}`] }
    case 'contains':
      return { sql: `${column} LIKE ?`, params: [`%${c}%`] }
    default:
      return { sql: `${column} LIKE ?`, params: [`%${c}%`] }
  }
}

export function searchLocutions(
  keyword: string, limit = 200, offset = 0,
  categories: string[] | null = null, searchIn: string[] = ['expression']
): { rows: { expression: string; categorie: string; definition: string }[]; total: number } {
  const input = keyword.trim()
  const params: unknown[] = []
  const where: string[] = []

  if (input) {
    const terms = input.split(/\s+/).filter(Boolean)
    for (const term of terms) {
      const parsed = parseLocutionTerm(term)
      if (!parsed) continue
      const fieldConditions: string[] = []
      for (const field of searchIn) {
        const col = field === 'expression' ? 'expression_upper' : 'UPPER(definition)'
        const cond = buildLocutionLikeCondition(parsed, col)
        fieldConditions.push(cond.sql)
        params.push(...cond.params)
      }
      where.push(`(${fieldConditions.join(' OR ')})`)
    }
  }

  if (categories && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',')
    where.push(`categorie IN (${placeholders})`)
    params.push(...categories)
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

  const totalRow = queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM locutions ${whereClause}`, params)
  const rows = queryAll<{ expression: string; categorie: string; definition: string }>(
    `SELECT expression, categorie, definition FROM locutions ${whereClause} ORDER BY expression_upper LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )
  return { rows, total: totalRow?.cnt ?? 0 }
}

export function getLocutionsCategories(): { categorie: string; cnt: number }[] {
  return queryAll('SELECT categorie, COUNT(*) as cnt FROM locutions GROUP BY categorie ORDER BY cnt DESC')
}

export function randomLocutions(count = 10): { expression: string; categorie: string; definition: string }[] {
  return queryAll("SELECT expression, categorie, definition FROM locutions WHERE definition != '' ORDER BY RANDOM() LIMIT ?", [count])
}

// ========== EXTERNAL DICT MANAGEMENT ==========

export function clearExternalSource(source: string): void {
  run('DELETE FROM external_words WHERE source = ?', [source])
}

export function insertExternalBatch(batch: unknown[][]): void {
  run('BEGIN')
  try {
    for (const item of batch) {
      run(
        'INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)',
        item
      )
    }
    run('COMMIT')
  } catch (e) {
    run('ROLLBACK')
    throw e
  }
}

export function deleteExternalSource(source: string): void {
  if (source === 'lexique') {
    exec('DELETE FROM lexique')
    run("UPDATE dict_settings SET word_count = 0 WHERE source = 'lexique'")
  } else {
    run('DELETE FROM external_words WHERE source = ?', [source])
    run('UPDATE dict_settings SET word_count = 0 WHERE source = ?', [source])
  }
}
