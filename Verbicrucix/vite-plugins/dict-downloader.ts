/**
 * Vite plugin for server-side dictionary downloads.
 * Runs in Node.js → no CORS, uses better-sqlite3 directly on verbicrucix.db.
 * Streams progress via SSE: GET /api/download/:source
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProgressCallback = (msg: string) => void

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseWrite(res: ServerResponse, event: object) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

// ─── Fetch helpers (Node 18+) ──────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries = 5, onProgress?: ProgressCallback) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Verbicrucix/2.0' },
        signal: AbortSignal.timeout(20000),
      })
      if (resp.status === 429 && attempt < maxRetries - 1) {
        const wait = 5000 * (attempt + 1)
        onProgress?.(`Rate limit — pause ${wait / 1000}s...`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return await resp.json()
    } catch (e) {
      if (attempt === maxRetries - 1) throw e
      onProgress?.(`Tentative ${attempt + 2}...`)
    }
  }
  return null
}

async function fetchBuffer(url: string, timeout = 30000): Promise<Buffer> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Verbicrucix/2.0' },
    signal: AbortSignal.timeout(timeout),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

// ─── Text normalizers ──────────────────────────────────────────────────────────

function stripAccents(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeForGrid(text: string): string {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '')
}

// ─── Wiktionnaire definition extractor ────────────────────────────────────────

function extractWiktDefinition(wikitext: string): string {
  const defs: string[] = []
  for (const line of wikitext.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') && !trimmed.startsWith('##') && !trimmed.startsWith('#*') && !trimmed.startsWith('#:')) {
      let d = trimmed.replace(/^#+/, '').trim()
      d = d.replace(/\{\{[^}]*\}\}/g, '')
      d = d.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      d = d.replace(/'{2,}/g, '')
      d = d.replace(/<[^>]+>/g, '')
      d = d.replace(/^[\s.,;:]+|[\s.,;:]+$/g, '')
      if (d && d.length > 3) defs.push(d)
    }
  }
  return defs.slice(0, 3).join(' / ')
}

// ─── Download functions ────────────────────────────────────────────────────────

async function downloadSigles(db: import('better-sqlite3').Database, onProgress: ProgressCallback) {
  const seen = new Set<string>()
  let batch: unknown[][] = []
  let total = 0
  let cleared = false

  const clearSource = () => { db.prepare('DELETE FROM external_words WHERE source = ?').run('sigles') }
  const insertBatch = (rows: unknown[][]) => {
    const stmt = db.prepare('INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)')
    const tx = db.transaction((items: unknown[][]) => { for (const item of items) stmt.run(...(item as Parameters<typeof stmt.run>)) })
    tx(rows)
  }

  for (const category of ['Sigles en français', 'Acronymes en français']) {
    onProgress(`Wiktionnaire : ${category}...`)
    try {
      let url: string | null = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0`
      while (url) {
        const data = await fetchWithRetry(url, 5, onProgress)
        if (!data) break
        for (const member of (data.query?.categorymembers || [])) {
          const title = member.title
          const grid = normalizeForGrid(title)
          if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
            seen.add(grid)
            batch.push([title, title.toUpperCase(), grid, `Sigle : ${title}`, 'SIG', 'sigles', grid.length])
            total++
            if (batch.length >= 500) {
              if (!cleared) { clearSource(); cleared = true }
              insertBatch(batch); batch = []
              onProgress(`${total} sigles...`)
            }
          }
        }
        const cont = data.continue?.cmcontinue
        if (cont) {
          url = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0&cmcontinue=${cont}`
          await new Promise(r => setTimeout(r, 300))
        } else { url = null }
      }
    } catch (e) { onProgress(`Erreur Wiktionnaire (${category}): ${(e as Error).message}`) }
  }

  const titles: Record<number, string> = {
    2: 'Liste_de_sigles_de_deux_caract%C3%A8res',
    3: 'Liste_de_sigles_de_trois_caract%C3%A8res',
    4: 'Liste_de_sigles_de_quatre_caract%C3%A8res',
    5: 'Liste_de_sigles_de_cinq_caract%C3%A8res',
  }
  for (const length of [2, 3, 4, 5]) {
    onProgress(`Wikipedia : sigles de ${length} lettres...`)
    try {
      const apiUrl = `https://fr.wikipedia.org/w/api.php?action=parse&page=${titles[length]}&prop=wikitext&format=json`
      const data = await fetchWithRetry(apiUrl, 3, onProgress)
      const wikitext: string = data?.parse?.wikitext?.['*'] || ''
      for (const line of wikitext.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('*') || trimmed.startsWith(';')) {
          let match = trimmed.match(/[*;]+\s*\[\[([A-ZÀ-Ÿ0-9]+)\]\]/)
          if (!match) match = trimmed.match(/[*;]+\s*'*([A-ZÀ-Ÿ]{2,6})'*/)
          if (match) {
            const sigle = match[1]
            const grid = normalizeForGrid(sigle)
            if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
              seen.add(grid)
              const defn = trimmed.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/[*;]+\s*/, '').trim().slice(0, 100)
              batch.push([sigle, sigle.toUpperCase(), grid, defn || `Sigle : ${sigle}`, 'SIG', 'sigles', grid.length])
              total++
            }
          }
        }
      }
    } catch (e) { onProgress(`Erreur Wikipedia sigles ${length}L: ${(e as Error).message}`) }
  }

  if (batch.length > 0) { if (!cleared) { clearSource(); cleared = true }; insertBatch(batch) }
  if (cleared) {
    db.prepare('UPDATE dict_settings SET word_count = ? WHERE source = ?').run(total, 'sigles')
    db.prepare("INSERT OR REPLACE INTO dict_settings (source, enabled, word_count) SELECT ?, enabled, ? FROM dict_settings WHERE source = ? UNION ALL SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM dict_settings WHERE source = ?)").run('sigles', total, 'sigles', 'sigles', total, 'sigles')
  } else {
    onProgress('Aucun sigle récupéré (rate-limit). Réessayez plus tard.')
  }
  return total
}

async function downloadCommunes(db: import('better-sqlite3').Database, onProgress: ProgressCallback) {
  db.prepare('DELETE FROM external_words WHERE source = ?').run('communes')
  onProgress('Téléchargement des communes...')
  const seen = new Set<string>()
  let batch: unknown[][] = []
  let total = 0
  const stmt = db.prepare('INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)')
  const insertBatch = (rows: unknown[][]) => { db.transaction((items: unknown[][]) => { for (const item of items) stmt.run(...(item as Parameters<typeof stmt.run>)) })(rows) }

  try {
    const url = 'https://www.data.gouv.fr/fr/datasets/r/dbe8a621-a9c4-4bc3-9cae-be1699c5ff25'
    const resp = await fetch(url, { headers: { 'User-Agent': 'Verbicrucix/2.0' }, signal: AbortSignal.timeout(30000) })
    const content = await resp.text()
    const lines = content.split('\n')
    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''))
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const values = parseCSVLine(lines[i])
      const row: Record<string, string> = {}
      headers.forEach((h: string, idx: number) => { row[h] = (values[idx] || '').trim() })
      const nom = row.nom_commune_complet || row.nom_commune || row.nom || ''
      if (!nom) continue
      const dept = row.code_departement || row.nom_departement || ''
      const grid = normalizeForGrid(nom)
      if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
        seen.add(grid)
        batch.push([nom, nom.toUpperCase(), grid, dept ? `Commune (${dept})` : 'Commune de France', 'GEO', 'communes', grid.length])
        total++
        if (batch.length >= 2000) { insertBatch(batch); batch = []; onProgress(`${total} communes...`) }
      }
    }
  } catch (e) { onProgress(`Erreur data.gouv.fr: ${(e as Error).message}`) }

  if (batch.length > 0) insertBatch(batch)
  db.prepare('UPDATE dict_settings SET word_count = ? WHERE source = ?').run(total, 'communes')
  db.prepare("UPDATE dict_settings SET enabled = 1 WHERE source = ?").run('communes')
  return total
}

async function downloadPrenoms(db: import('better-sqlite3').Database, onProgress: ProgressCallback) {
  db.prepare('DELETE FROM external_words WHERE source = ?').run('prenoms')
  onProgress('Téléchargement des prénoms INSEE...')
  const seen = new Set<string>()
  let batch: unknown[][] = []
  let total = 0
  const stmt = db.prepare('INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)')
  const insertBatch = (rows: unknown[][]) => { db.transaction((items: unknown[][]) => { for (const item of items) stmt.run(...(item as Parameters<typeof stmt.run>)) })(rows) }

  let downloaded = false
  const urls = [
    'https://www.insee.fr/fr/statistiques/fichier/8595130/nat2023_csv.zip',
    'https://www.insee.fr/fr/statistiques/fichier/7633685/nat2022_csv.zip',
    'https://www.insee.fr/fr/statistiques/fichier/2540004/nat2021_csv.zip',
  ]

  for (const url of urls) {
    try {
      onProgress(`Tentative INSEE : ${url.split('/').pop()}...`)
      const zipBuffer = await fetchBuffer(url, 30000)
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(zipBuffer)
      const csvEntry = zip.getEntries().find(e => e.entryName.endsWith('.csv'))
      if (!csvEntry) continue
      const content = csvEntry.getData().toString('utf-8')
      const delimiter = content.split('\n')[0].includes(';') ? ';' : ','
      const csvLines = content.split('\n')
      const csvHeaders = csvLines[0].split(delimiter).map((h: string) => h.trim().replace(/"/g, ''))
      for (let i = 1; i < csvLines.length; i++) {
        if (!csvLines[i].trim()) continue
        const values = csvLines[i].split(delimiter).map((v: string) => v.trim().replace(/"/g, ''))
        const row: Record<string, string> = {}
        csvHeaders.forEach((h: string, idx: number) => { row[h] = values[idx] || '' })
        const prenom = (row.preusuel || row['prénom'] || '').trim()
        if (!prenom || prenom === '_PRENOMS_RARES') continue
        const sexe = row.sexe || ''
        const genre = sexe === '1' ? 'masculin' : sexe === '2' ? 'féminin' : ''
        const grid = normalizeForGrid(prenom)
        if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
          seen.add(grid)
          batch.push([prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase(), prenom.toUpperCase(), grid, genre ? `Prénom ${genre}` : 'Prénom', 'PRE', 'prenoms', grid.length])
          total++
          if (batch.length >= 1000) { insertBatch(batch); batch = []; onProgress(`${total} prénoms...`) }
        }
      }
      downloaded = true
      break
    } catch (e) { onProgress(`Erreur ${url.split('/').pop()}: ${(e as Error).message}`) }
  }

  if (!downloaded) {
    onProgress('Fallback Wikidata pour les prénoms...')
    try {
      const query = `SELECT DISTINCT ?itemLabel WHERE { ?item wdt:P31 wd:Q202444 . SERVICE wikibase:label { bd:serviceParam wikibase:language "fr" } } LIMIT 10000`
      const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`
      const data = await fetchWithRetry(url, 3, onProgress)
      for (const result of (data?.results?.bindings || [])) {
        const prenom = result.itemLabel?.value || ''
        if (!prenom || prenom.startsWith('Q')) continue
        const grid = normalizeForGrid(prenom)
        if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
          seen.add(grid)
          batch.push([prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase(), prenom.toUpperCase(), grid, 'Prénom', 'PRE', 'prenoms', grid.length])
          total++
        }
      }
    } catch (e) { onProgress(`Erreur Wikidata: ${(e as Error).message}`) }
  }

  if (batch.length > 0) insertBatch(batch)
  db.prepare('UPDATE dict_settings SET word_count = ?, enabled = 1 WHERE source = ?').run(total, 'prenoms')
  return total
}

async function downloadToponymes(db: import('better-sqlite3').Database, onProgress: ProgressCallback) {
  db.prepare('DELETE FROM external_words WHERE source = ?').run('toponymes')
  onProgress('Téléchargement GeoNames FR...')
  const seen = new Set<string>()
  let batch: unknown[][] = []
  let total = 0
  const stmt = db.prepare('INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)')
  const insertBatch = (rows: unknown[][]) => { db.transaction((items: unknown[][]) => { for (const item of items) stmt.run(...(item as Parameters<typeof stmt.run>)) })(rows) }

  const featureLabels: Record<string, string> = {
    H: "Cours d'eau", T: 'Relief', L: 'Région/Zone',
    S: 'Monument', V: 'Forêt/Végétation', U: 'Sous-marin',
  }

  try {
    const zipBuffer = await fetchBuffer('https://download.geonames.org/export/dump/FR.zip', 120000)
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip(zipBuffer)
    const entry = zip.getEntry('FR.txt')
    if (!entry) throw new Error('FR.txt introuvable dans le ZIP')
    const content = entry.getData().toString('utf-8')
    const lines = content.split('\n')
    onProgress(`Traitement de ${lines.length} entrées GeoNames...`)
    for (const line of lines) {
      const fields = line.split('\t')
      if (fields.length < 8) continue
      const name = fields[1]
      const featureClass = fields[6]
      if (!(featureClass in featureLabels)) continue
      const grid = normalizeForGrid(name)
      if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
        seen.add(grid)
        batch.push([name, name.toUpperCase(), grid, featureLabels[featureClass], 'GEO', 'toponymes', grid.length])
        total++
        if (batch.length >= 2000) { insertBatch(batch); batch = []; onProgress(`${total} toponymes...`) }
      }
    }
  } catch (e) { onProgress(`Erreur GeoNames: ${(e as Error).message}`) }

  if (batch.length > 0) insertBatch(batch)
  db.prepare('UPDATE dict_settings SET word_count = ?, enabled = 1 WHERE source = ?').run(total, 'toponymes')
  return total
}

async function downloadPersonnalites(db: import('better-sqlite3').Database, onProgress: ProgressCallback) {
  db.prepare('DELETE FROM external_words WHERE source = ?').run('personnalites')
  const seen = new Set<string>()
  let batch: unknown[][] = []
  let total = 0
  const stmt = db.prepare('INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)')
  const insertBatch = (rows: unknown[][]) => { db.transaction((items: unknown[][]) => { for (const item of items) stmt.run(...(item as Parameters<typeof stmt.run>)) })(rows) }

  const queries: [string, string][] = [
    ['Personnalités françaises', `SELECT ?itemLabel ?itemDescription WHERE { ?item wdt:P31 wd:Q5 ; wdt:P27 wd:Q142 . ?item wikibase:sitelinks ?slinks . FILTER(?slinks > 5) SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" } } LIMIT 8000`],
    ['Personnalités internationales', `SELECT ?itemLabel ?itemDescription WHERE { ?item wdt:P31 wd:Q5 . ?item wikibase:sitelinks ?slinks . FILTER(?slinks > 30) SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" } } LIMIT 8000`],
  ]

  for (const [label, query] of queries) {
    onProgress(`Wikidata : ${label}...`)
    try {
      const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query.trim())}&format=json`
      const resp = await fetch(url, { headers: { 'User-Agent': 'Verbicrucix/2.0', Accept: 'application/json' }, signal: AbortSignal.timeout(60000) })
      const data = await resp.json()
      for (const result of (data.results?.bindings || [])) {
        const name: string = result.itemLabel?.value || ''
        const desc: string = result.itemDescription?.value || ''
        if (!name || name.startsWith('Q')) continue
        const parts = name.split(' ')
        const namesToAdd = [name]
        if (parts.length >= 2) namesToAdd.push(parts[parts.length - 1])
        for (const n of namesToAdd) {
          const grid = normalizeForGrid(n)
          if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
            seen.add(grid)
            const defn = (desc && !desc.startsWith('Q')) ? desc.slice(0, 100) : `Personnalité : ${name}`
            batch.push([n, n.toUpperCase(), grid, defn, 'NP', 'personnalites', grid.length])
            total++
            if (batch.length >= 1000) { insertBatch(batch); batch = []; onProgress(`${total} personnalités...`) }
          }
        }
      }
    } catch (e) { onProgress(`Erreur Wikidata (${label}): ${(e as Error).message}`) }
  }

  if (batch.length > 0) insertBatch(batch)
  db.prepare('UPDATE dict_settings SET word_count = ?, enabled = 1 WHERE source = ?').run(total, 'personnalites')
  return total
}

async function downloadWikipedia(db: import('better-sqlite3').Database, onProgress: ProgressCallback, dbDir: string) {
  const candidates = [
    path.join(dbDir, 'dictionnaire_wikipedia.json'),
    path.join(dbDir, 'dictionnaire_wikipedia.json'),
  ]
  const jsonPath = candidates.find(p => fs.existsSync(p))
  if (!jsonPath) {
    onProgress(`Erreur : dictionnaire_wikipedia.json introuvable (cherché dans : ${candidates.join(', ')})`)
    return 0
  }
  onProgress('Chargement du dictionnaire Wikipedia...')
  const data: Record<string, string> = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  if (!data || Object.keys(data).length === 0) { onProgress('Fichier vide'); return 0 }

  db.prepare('DELETE FROM external_words WHERE source = ?').run('wikipedia')
  const stmt = db.prepare('INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)')
  const insertBatch = (rows: unknown[][]) => { db.transaction((items: unknown[][]) => { for (const item of items) stmt.run(...(item as Parameters<typeof stmt.run>)) })(rows) }

  let batch: unknown[][] = []
  let count = 0
  const totalEntries = Object.keys(data).length
  for (const [motUpper, definition] of Object.entries(data)) {
    if (motUpper.length < 2) continue
    batch.push([motUpper, motUpper, motUpper, definition || '', '', 'wikipedia', motUpper.length])
    count++
    if (batch.length >= 5000) {
      insertBatch(batch); batch = []
      onProgress(`Wikipedia : ${count}/${totalEntries} mots...`)
    }
  }
  if (batch.length > 0) insertBatch(batch)
  db.prepare('UPDATE dict_settings SET word_count = ?, enabled = 1 WHERE source = ?').run(count, 'wikipedia')
  onProgress(`Wikipedia : ${count} mots importés !`)
  return count
}

async function downloadLocutions(db: import('better-sqlite3').Database, onProgress: ProgressCallback) {
  const categories: Record<string, string> = {
    'Locutions nominales en français': 'Loc. nominale',
    'Locutions verbales en français': 'Loc. verbale',
    'Locutions adverbiales en français': 'Loc. adverbiale',
    'Locutions adjectivales en français': 'Loc. adjectivale',
    'Locutions prépositives en français': 'Loc. prépositive',
    'Locutions interjectives en français': 'Loc. interjective',
    'Locutions conjonctives en français': 'Loc. conjonctive',
    'Proverbes en français': 'Proverbe',
  }

  let batch: [string, string, string, string][] = []
  let total = 0
  let cleared = false
  const seen = new Set<string>()

  const flushBatch = () => {
    if (!cleared) { db.prepare('DELETE FROM locutions').run(); cleared = true }
    const ins = db.prepare('INSERT INTO locutions (expression, expression_upper, categorie, definition) VALUES (?, ?, ?, ?)')
    db.transaction((items: typeof batch) => { for (const item of items) ins.run(...item) })(batch)
    batch = []
  }

  for (const [category, catLabel] of Object.entries(categories)) {
    onProgress(`Wiktionnaire : ${category}...`)
    let catErrors = 0
    let url: string | null = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0`
    while (url) {
      let data
      try {
        data = await fetchWithRetry(url, 5, onProgress)
      } catch {
        catErrors++
        if (catErrors >= 3) { onProgress(`Trop d'erreurs pour ${category}, passage à la suivante.`); break }
        continue
      }
      if (!data) break
      for (const member of (data.query?.categorymembers || [])) {
        const title: string = member.title
        const titleUpper = title.toUpperCase()
        if (!seen.has(titleUpper)) {
          seen.add(titleUpper)
          batch.push([title, titleUpper, catLabel, ''])
          total++
          if (batch.length >= 500) { flushBatch(); onProgress(`${total} locutions...`) }
        }
      }
      const cont = data.continue?.cmcontinue
      if (cont) {
        url = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0&cmcontinue=${encodeURIComponent(cont)}`
        await new Promise(r => setTimeout(r, 300))
      } else { url = null }
    }
  }

  if (batch.length > 0) flushBatch()
  if (!cleared) { onProgress("Aucune locution récupérée (rate-limit). Réessayez plus tard."); return 0 }

  onProgress(`${total} locutions collectées. Récupération des définitions...`)

  // 2e passe : définitions
  const allExpressions: { id: number; expression: string }[] = db.prepare("SELECT id, expression FROM locutions WHERE definition = ''").all() as { id: number; expression: string }[]
  let doneDefs = 0
  let consecutiveErrors = 0

  for (let i = 0; i < allExpressions.length; i += 50) {
    const batchExprs = allExpressions.slice(i, i + 50)
    const titlesMap: Record<string, number> = {}
    for (const row of batchExprs) titlesMap[row.expression] = row.id
    try {
      const apiUrl = `https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(Object.keys(titlesMap).join('|'))}&format=json`
      const data = await fetchWithRetry(apiUrl, 5, onProgress)
      consecutiveErrors = 0
      if (data) {
        for (const [, page] of Object.entries<Record<string, unknown>>(data.query?.pages || {})) {
          const title = page.title as string || ''
          if (title in titlesMap) {
            const content = (page.revisions as Record<string, unknown>[])?.[0]?.slots?.main?.['*'] as string || ''
            const defn = extractWiktDefinition(content)
            if (defn) db.prepare('UPDATE locutions SET definition = ? WHERE id = ?').run(defn, titlesMap[title])
          }
        }
      }
    } catch {
      consecutiveErrors++
      if (consecutiveErrors >= 3) { onProgress(`Trop d'erreurs, arrêt à ${doneDefs}/${allExpressions.length}`); break }
    }
    doneDefs += batchExprs.length
    if (doneDefs % 500 === 0 || doneDefs === allExpressions.length) onProgress(`Définitions : ${doneDefs}/${allExpressions.length}...`)
    await new Promise(r => setTimeout(r, 500))
  }

  onProgress(`Terminé : ${total} locutions.`)
  return total
}

// ─── Vite Plugin ──────────────────────────────────────────────────────────────

export function dictDownloadPlugin(dbPath: string): Plugin {
  const dbDir = path.dirname(dbPath)

  async function handleDownload(source: string, req: IncomingMessage, res: ServerResponse) {
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const onProgress: ProgressCallback = (msg) => sseWrite(res, { type: 'progress', message: msg })

    try {
      const BetterSqlite3 = (await import('better-sqlite3')).default
      const db = new BetterSqlite3(dbPath)
      db.pragma('journal_mode = WAL')

      let total = 0
      switch (source) {
        case 'sigles':        total = await downloadSigles(db, onProgress); break
        case 'communes':      total = await downloadCommunes(db, onProgress); break
        case 'prenoms':       total = await downloadPrenoms(db, onProgress); break
        case 'toponymes':     total = await downloadToponymes(db, onProgress); break
        case 'personnalites': total = await downloadPersonnalites(db, onProgress); break
        case 'wikipedia':     total = await downloadWikipedia(db, onProgress, dbDir); break
        case 'locutions':     total = await downloadLocutions(db, onProgress); break
        default:
          sseWrite(res, { type: 'error', message: `Source inconnue : ${source}` })
          res.end()
          db.close()
          return
      }

      db.close()
      sseWrite(res, { type: 'done', total })
    } catch (e) {
      sseWrite(res, { type: 'error', message: (e as Error).message })
    }

    res.end()
  }

  return {
    name: 'dict-download-plugin',
    configureServer(server) {
      server.middlewares.use('/api/download/', (req, res, next) => {
        const source = req.url?.replace(/^\//, '') ?? ''
        if (!source) { next(); return }
        handleDownload(source, req, res)
      })
    },
  }
}
