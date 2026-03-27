/**
 * Couche base de données SQLite pour le Verbicruciste (webapp).
 * Port 1:1 de verbicruciste/database.py.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Chemins
const DB_DIR = path.resolve(__dirname, '..', 'verbicruciste');
const DB_PATH = path.join(DB_DIR, 'verbicruciste.db');
const BACKUP_DIR = path.join(DB_DIR, 'backups');
const LEXIQUE_PATH = path.join(DB_DIR, 'Lexique383.tsv');

// Dictionnaires externes
const EXTERNAL_DICTS = {
  sigles: { label: 'Sigles & Acronymes', description: 'Sigles français (Wiktionnaire + Wikipedia)' },
  communes: { label: 'Communes de France', description: 'Toutes les communes françaises (data.gouv.fr)' },
  prenoms: { label: 'Prénoms', description: 'Prénoms donnés en France depuis 1900 (INSEE)' },
  toponymes: { label: 'Toponymes (GeoNames)', description: 'Lieux géographiques de France' },
  personnalites: { label: 'Personnalités', description: 'Personnalités françaises et internationales (Wikidata)' },
  wikipedia: { label: 'Wikipedia FR', description: 'Tous les mots-titres + noms de famille (Wikipedia FR)' },
};

// Connexion DB (singleton)
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH, { timeout: 10000 });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// ========== UTILITAIRES ==========

function stripAccents(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeForGrid(text) {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '');
}

function normalizeForSearch(text) {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '');
}

// ========== PATTERN MATCHING ==========

function patternToRegex(pattern) {
  let regex = '^';
  for (const ch of pattern.toUpperCase()) {
    if (ch === '?') regex += '.';
    else if (ch === '/') regex += '.*';
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  regex += '$';
  return new RegExp(regex);
}

function patternToLike(pattern) {
  let like = '';
  let hasKnown = false;
  for (const ch of pattern.toUpperCase()) {
    if (ch === '?') {
      like += '_';
    } else if (ch === '/') {
      like += '%';
    } else {
      if (ch === '%' || ch === '_') like += '\\' + ch;
      else like += ch;
      hasKnown = true;
    }
  }
  return hasKnown ? like : null;
}

function patternHasWildcard(pattern) {
  return pattern.includes('/');
}

// ========== BACKUP ==========

function backupDb() {
  if (!fs.existsSync(DB_PATH)) return null;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
  const backupPath = path.join(BACKUP_DIR, `verbicruciste_${timestamp}.db`);

  try {
    const src = getDb();
    src.backup(backupPath);

    // Garder les 5 dernières sauvegardes
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('verbicruciste_') && f.endsWith('.db'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime);

    while (backups.length > 5) {
      const old = backups.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, old.name));
    }
    return backupPath;
  } catch (e) {
    console.error('Erreur backup:', e.message);
    return null;
  }
}

// ========== INIT ==========

function initDb() {
  const d = getDb();

  // Lexique 3
  d.exec(`
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
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_lexique_ortho ON lexique(ortho_upper)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_lexique_lemme ON lexique(lemme)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_lexique_nblettres ON lexique(nblettres)');

  // Dictionnaires personnels
  d.exec(`
    CREATE TABLE IF NOT EXISTS personal_dicts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      date_creation TEXT DEFAULT (date('now'))
    )
  `);
  const existingPd = d.prepare('SELECT COUNT(*) as cnt FROM personal_dicts').get();
  if (existingPd.cnt === 0) {
    d.prepare("INSERT INTO personal_dicts (id, name) VALUES (1, 'dictionnaire_personnel')").run();
  }

  // Dictionnaire personnel
  d.exec(`
    CREATE TABLE IF NOT EXISTS dictionnaire_perso (
      id INTEGER PRIMARY KEY,
      mot TEXT NOT NULL,
      mot_upper TEXT NOT NULL,
      definitions TEXT DEFAULT '[]',
      categorie TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      date_ajout TEXT DEFAULT (date('now')),
      date_modif TEXT DEFAULT (date('now'))
    )
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_perso_mot ON dictionnaire_perso(mot_upper)');

  // Migration dict_id
  const cols = d.prepare('PRAGMA table_info(dictionnaire_perso)').all();
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('dict_id')) {
    d.exec(`
      CREATE TABLE dictionnaire_perso_new (
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
    `);
    d.exec(`
      INSERT INTO dictionnaire_perso_new (id, dict_id, mot, mot_upper, definitions, categorie, notes, date_ajout, date_modif)
      SELECT id, 1, mot, mot_upper, definitions, categorie, notes, date_ajout, date_modif FROM dictionnaire_perso
    `);
    d.exec('DROP TABLE dictionnaire_perso');
    d.exec('ALTER TABLE dictionnaire_perso_new RENAME TO dictionnaire_perso');
  }
  d.exec('CREATE INDEX IF NOT EXISTS idx_perso_mot ON dictionnaire_perso(mot_upper)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_perso_dict ON dictionnaire_perso(dict_id)');

  // Dictionnaires externes
  d.exec(`
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
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_ext_source ON external_words(source)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_ext_grid ON external_words(mot_grid)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_ext_nblettres ON external_words(nblettres, source)');

  // Dict settings
  d.exec(`
    CREATE TABLE IF NOT EXISTS dict_settings (
      source TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      word_count INTEGER DEFAULT 0
    )
  `);
  d.prepare("INSERT OR IGNORE INTO dict_settings (source, enabled) VALUES ('lexique', 1)").run();
  const pds = d.prepare('SELECT id FROM personal_dicts').all();
  for (const pd of pds) {
    d.prepare('INSERT OR IGNORE INTO dict_settings (source, enabled) VALUES (?, 1)').run(`personnel_${pd.id}`);
  }
  for (const source of Object.keys(EXTERNAL_DICTS)) {
    d.prepare('INSERT OR IGNORE INTO dict_settings (source, enabled, word_count) VALUES (?, 0, 0)').run(source);
  }

  // Groupes de filtres
  d.exec(`
    CREATE TABLE IF NOT EXISTS dict_groups (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0
    )
  `);
  d.exec(`
    CREATE TABLE IF NOT EXISTS dict_group_sources (
      group_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (group_id, source),
      FOREIGN KEY (group_id) REFERENCES dict_groups(id) ON DELETE CASCADE
    )
  `);

  const existingGroups = d.prepare('SELECT COUNT(*) as cnt FROM dict_groups').get();
  if (existingGroups.cnt === 0) {
    const r1 = d.prepare("INSERT INTO dict_groups (name, position) VALUES ('Dicos principaux', 0)").run();
    const gid1 = r1.lastInsertRowid;
    d.prepare("INSERT INTO dict_group_sources (group_id, source) VALUES (?, 'lexique')").run(gid1);
    for (const pd of pds) {
      d.prepare('INSERT INTO dict_group_sources (group_id, source) VALUES (?, ?)').run(gid1, `personnel_${pd.id}`);
    }
    const r2 = d.prepare("INSERT INTO dict_groups (name, position) VALUES ('Autres', 1)").run();
    const gid2 = r2.lastInsertRowid;
    for (const src of Object.keys(EXTERNAL_DICTS)) {
      d.prepare('INSERT INTO dict_group_sources (group_id, source) VALUES (?, ?)').run(gid2, src);
    }
  }

  // Locutions
  d.exec(`
    CREATE TABLE IF NOT EXISTS locutions (
      id INTEGER PRIMARY KEY,
      expression TEXT NOT NULL,
      expression_upper TEXT NOT NULL,
      categorie TEXT DEFAULT '',
      definition TEXT DEFAULT ''
    )
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_locutions_upper ON locutions(expression_upper)');

  // Mémos
  d.exec(`
    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY,
      mot TEXT DEFAULT '',
      dict_target TEXT DEFAULT '',
      categorie TEXT DEFAULT '',
      note TEXT DEFAULT '',
      date_creation TEXT DEFAULT (datetime('now')),
      date_modif TEXT DEFAULT (datetime('now'))
    )
  `);
  // Migration: ajouter categorie si absente
  const memoCols = d.prepare("PRAGMA table_info(memos)").all().map(c => c.name);
  if (!memoCols.includes('categorie')) {
    d.exec("ALTER TABLE memos ADD COLUMN categorie TEXT DEFAULT ''");
  }

  // Grilles
  d.exec(`
    CREATE TABLE IF NOT EXISTS grilles (
      id INTEGER PRIMARY KEY,
      nom TEXT NOT NULL,
      json_data TEXT NOT NULL,
      terminee INTEGER DEFAULT 0,
      date_creation TEXT DEFAULT (datetime('now')),
      date_modif TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration personnel → personnel_1
  const oldPersonnel = d.prepare("SELECT * FROM dict_settings WHERE source = 'personnel'").get();
  if (oldPersonnel) {
    d.prepare("INSERT OR IGNORE INTO dict_settings (source, enabled, word_count) VALUES ('personnel_1', ?, ?)").run(oldPersonnel.enabled, oldPersonnel.word_count);
    d.prepare("DELETE FROM dict_settings WHERE source = 'personnel'").run();
    d.prepare("UPDATE OR IGNORE dict_group_sources SET source = 'personnel_1' WHERE source = 'personnel'").run();
    d.prepare("DELETE FROM dict_group_sources WHERE source = 'personnel'").run();
  }

  // Migration : ajouter custom_label à dict_settings
  const dsCols = d.prepare("PRAGMA table_info(dict_settings)").all().map(c => c.name);
  if (!dsCols.includes('custom_label')) {
    d.exec("ALTER TABLE dict_settings ADD COLUMN custom_label TEXT DEFAULT ''");
  }

  // Migration : normaliser les accents dans tous les champs de recherche
  normalizeAccentsInDb(d);
}

function normalizeAccentsInDb(d) {
  // Quick check: is there anything to normalize?
  const check = (table, col) =>
    d.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} GLOB '*[^A-Z]*'`).get().cnt;

  // Lexique : ortho_upper
  const lexCount = check('lexique', 'ortho_upper');
  if (lexCount > 0) {
    console.log(`Normalisation des accents : ${lexCount} entrées lexique...`);
    const rows = d.prepare("SELECT id, ortho_upper FROM lexique WHERE ortho_upper GLOB '*[^A-Z]*'").all();
    const upd = d.prepare('UPDATE lexique SET ortho_upper = ? WHERE id = ?');
    d.transaction(() => {
      for (const row of rows) upd.run(normalizeForGrid(row.ortho_upper), row.id);
    })();
  }

  // Dictionnaire personnel : mot et mot_upper
  const persoCount = check('dictionnaire_perso', 'mot_upper');
  if (persoCount > 0) {
    console.log(`Normalisation des accents : ${persoCount} entrées personnelles...`);
    const rows = d.prepare("SELECT id, mot FROM dictionnaire_perso WHERE mot_upper GLOB '*[^A-Z]*'").all();
    const upd = d.prepare('UPDATE dictionnaire_perso SET mot = ?, mot_upper = ? WHERE id = ?');
    d.transaction(() => {
      for (const row of rows) {
        const n = normalizeForGrid(row.mot);
        upd.run(n, n, row.id);
      }
    })();
  }

  // External words : mot_grid
  const extCount = check('external_words', 'mot_grid');
  if (extCount > 0) {
    console.log(`Normalisation des accents : ${extCount} entrées externes...`);
    const rows = d.prepare("SELECT id, mot_grid FROM external_words WHERE mot_grid GLOB '*[^A-Z]*'").all();
    const upd = d.prepare('UPDATE external_words SET mot_grid = ? WHERE id = ?');
    d.transaction(() => {
      for (const row of rows) upd.run(normalizeForGrid(row.mot_grid), row.id);
    })();
  }
}

// ========== SOURCES & SETTINGS ==========

function getEnabledSources() {
  return getDb().prepare('SELECT source FROM dict_settings WHERE enabled = 1').all().map(r => r.source);
}

function setSourceEnabled(source, enabled) {
  getDb().prepare(`
    INSERT OR REPLACE INTO dict_settings (source, enabled, word_count)
    VALUES (?, ?, COALESCE((SELECT word_count FROM dict_settings WHERE source = ?), 0))
  `).run(source, enabled ? 1 : 0, source);
}

function getDictSettings() {
  const rows = getDb().prepare('SELECT * FROM dict_settings').all();
  const result = {};
  for (const r of rows) result[r.source] = r;
  return result;
}

function renameExternalDict(source, label) {
  getDb().prepare('UPDATE dict_settings SET custom_label = ? WHERE source = ?').run(label, source);
}

// ========== GROUPES ==========

function getDictGroups() {
  const d = getDb();
  const groups = d.prepare('SELECT * FROM dict_groups ORDER BY position').all();
  return groups.map(g => {
    const sources = d.prepare('SELECT source FROM dict_group_sources WHERE group_id = ?').all(g.id);
    return { id: g.id, name: g.name, position: g.position, sources: sources.map(s => s.source) };
  });
}

function addDictGroup(name, sources = []) {
  const d = getDb();
  const maxPos = d.prepare('SELECT COALESCE(MAX(position), -1) as m FROM dict_groups').get().m;
  const r = d.prepare('INSERT INTO dict_groups (name, position) VALUES (?, ?)').run(name, maxPos + 1);
  const gid = r.lastInsertRowid;
  const ins = d.prepare('INSERT OR IGNORE INTO dict_group_sources (group_id, source) VALUES (?, ?)');
  for (const src of sources) ins.run(gid, src);
  return gid;
}

function updateDictGroup(groupId, name, sources) {
  const d = getDb();
  if (name !== undefined && name !== null) {
    d.prepare('UPDATE dict_groups SET name = ? WHERE id = ?').run(name, groupId);
  }
  if (sources !== undefined && sources !== null) {
    d.prepare('DELETE FROM dict_group_sources WHERE group_id = ?').run(groupId);
    const ins = d.prepare('INSERT INTO dict_group_sources (group_id, source) VALUES (?, ?)');
    for (const src of sources) ins.run(groupId, src);
  }
}

function deleteDictGroup(groupId) {
  const d = getDb();
  d.prepare('DELETE FROM dict_group_sources WHERE group_id = ?').run(groupId);
  d.prepare('DELETE FROM dict_groups WHERE id = ?').run(groupId);
}

// ========== RECHERCHE PAR PATTERN ==========

function searchByPatternGrouped(pattern, onlySources = null) {
  const regex = patternToRegex(pattern);
  const like = patternToLike(pattern);
  const wild = patternHasWildcard(pattern);
  const length = pattern.replace(/\//g, '').length; // length without '/' chars (used only when no wildcard)
  const d = getDb();
  let enabled = new Set(getEnabledSources());
  if (onlySources !== null) {
    const onlySet = new Set(onlySources);
    enabled = new Set([...enabled].filter(s => onlySet.has(s)));
  }
  const resultsBySource = {};
  const seen = new Set();

  // Dictionnaires personnels
  const personalSources = [...enabled].filter(s => s.startsWith('personnel_'));
  if (personalSources.length > 0) {
    const dictIds = personalSources.map(s => parseInt(s.split('_')[1]));
    const placeholders = dictIds.map(() => '?').join(',');
    let sql, params;
    if (wild) {
      params = like ? [like, ...dictIds] : [...dictIds];
      sql = like
        ? `SELECT dict_id, mot, mot_upper, definitions, categorie FROM dictionnaire_perso WHERE mot_upper LIKE ? AND dict_id IN (${placeholders})`
        : `SELECT dict_id, mot, mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id IN (${placeholders})`;
    } else {
      params = like ? [length, like, ...dictIds] : [length, ...dictIds];
      sql = like
        ? `SELECT dict_id, mot, mot_upper, definitions, categorie FROM dictionnaire_perso WHERE length(mot_upper) = ? AND mot_upper LIKE ? AND dict_id IN (${placeholders})`
        : `SELECT dict_id, mot, mot_upper, definitions, categorie FROM dictionnaire_perso WHERE length(mot_upper) = ? AND dict_id IN (${placeholders})`;
    }
    const rows = d.prepare(sql).all(...params);
    for (const row of rows) {
      if (regex.test(row.mot_upper) && !seen.has(row.mot_upper)) {
        seen.add(row.mot_upper);
        const defs = row.definitions ? JSON.parse(row.definitions) : [];
        const src = `personnel_${row.dict_id}`;
        if (!resultsBySource[src]) resultsBySource[src] = [];
        resultsBySource[src].push({
          ortho: row.mot, ortho_upper: row.mot_upper,
          definition: defs[0] || '', categorie: row.categorie, source: src
        });
      }
    }
  }

  // Lexique
  if (enabled.has('lexique')) {
    let sql, params;
    if (wild) {
      params = like ? [like] : [];
      sql = like
        ? 'SELECT DISTINCT ortho, ortho_upper, lemme, cgram FROM lexique WHERE ortho_upper LIKE ? ORDER BY ortho_upper'
        : 'SELECT DISTINCT ortho, ortho_upper, lemme, cgram FROM lexique ORDER BY ortho_upper';
    } else {
      params = like ? [length, like] : [length];
      sql = like
        ? 'SELECT DISTINCT ortho, ortho_upper, lemme, cgram FROM lexique WHERE nblettres = ? AND ortho_upper LIKE ? ORDER BY ortho_upper'
        : 'SELECT DISTINCT ortho, ortho_upper, lemme, cgram FROM lexique WHERE nblettres = ? ORDER BY ortho_upper';
    }
    const rows = d.prepare(sql).all(...params);
    const lexique = [];
    for (const row of rows) {
      if (regex.test(row.ortho_upper) && !seen.has(row.ortho_upper)) {
        seen.add(row.ortho_upper);
        lexique.push({
          ortho: row.ortho, ortho_upper: row.ortho_upper,
          lemme: row.lemme, categorie: row.cgram, source: 'lexique'
        });
      }
    }
    if (lexique.length > 0) resultsBySource.lexique = lexique;
  }

  // Dictionnaires externes
  const extSources = [...enabled].filter(s => s in EXTERNAL_DICTS);
  if (extSources.length > 0) {
    const placeholders = extSources.map(() => '?').join(',');
    let sql, params;
    if (wild) {
      params = like ? [like, ...extSources] : [...extSources];
      sql = like
        ? `SELECT mot, mot_grid, definition, categorie, source FROM external_words WHERE mot_grid LIKE ? AND source IN (${placeholders}) ORDER BY mot_grid`
        : `SELECT mot, mot_grid, definition, categorie, source FROM external_words WHERE source IN (${placeholders}) ORDER BY mot_grid`;
    } else {
      params = like ? [length, like, ...extSources] : [length, ...extSources];
      sql = like
        ? `SELECT mot, mot_grid, definition, categorie, source FROM external_words WHERE nblettres = ? AND mot_grid LIKE ? AND source IN (${placeholders}) ORDER BY mot_grid`
        : `SELECT mot, mot_grid, definition, categorie, source FROM external_words WHERE nblettres = ? AND source IN (${placeholders}) ORDER BY mot_grid`;
    }
    const rows = d.prepare(sql).all(...params);
    for (const row of rows) {
      if (regex.test(row.mot_grid) && !seen.has(row.mot_grid)) {
        seen.add(row.mot_grid);
        const src = row.source;
        if (!resultsBySource[src]) resultsBySource[src] = [];
        resultsBySource[src].push({
          ortho: row.mot, ortho_upper: row.mot_grid,
          definition: row.definition, categorie: row.categorie, source: src
        });
      }
    }
  }

  return resultsBySource;
}

function searchByPatternFlat(pattern, sources = null) {
  const grouped = searchByPatternGrouped(pattern, sources);
  const results = [];
  for (const [source, words] of Object.entries(grouped)) {
    for (const w of words) {
      results.push(w);
    }
  }
  results.sort((a, b) => a.ortho_upper.localeCompare(b.ortho_upper));
  return results;
}

function getAllSources() {
  const d = getDb();
  const sources = [];
  // Personal dicts
  const dicts = d.prepare('SELECT id, name FROM personal_dicts ORDER BY name').all();
  for (const pd of dicts) {
    const count = d.prepare('SELECT COUNT(*) as cnt FROM dictionnaire_perso WHERE dict_id = ?').get(pd.id).cnt;
    sources.push({ id: `personnel_${pd.id}`, label: pd.name, count });
  }
  // Lexique
  const lexCount = d.prepare('SELECT COUNT(DISTINCT ortho_upper) as cnt FROM lexique').get().cnt;
  if (lexCount > 0) sources.push({ id: 'lexique', label: 'Lexique 3', count: lexCount });
  // External
  for (const [key, info] of Object.entries(EXTERNAL_DICTS)) {
    const count = d.prepare('SELECT COUNT(*) as cnt FROM external_words WHERE source = ?').get(key).cnt;
    if (count > 0) sources.push({ id: key, label: info.label, count });
  }
  return sources;
}

// ========== FORMES DÉRIVÉES ==========

function getDerivedForms(lemme) {
  return getDb().prepare(
    'SELECT DISTINCT ortho, cgram, genre, nombre, infover FROM lexique WHERE lemme = ? ORDER BY ortho'
  ).all(lemme);
}

// ========== DICTIONNAIRES PERSONNELS ==========

function getPersonalDicts() {
  return getDb().prepare('SELECT * FROM personal_dicts ORDER BY id').all();
}

function addPersonalDict(name) {
  const d = getDb();
  try {
    const r = d.prepare('INSERT INTO personal_dicts (name) VALUES (?)').run(name);
    const dictId = r.lastInsertRowid;
    const src = `personnel_${dictId}`;
    d.prepare("INSERT OR IGNORE INTO dict_settings (source, enabled) VALUES (?, 1)").run(src);
    const firstGroup = d.prepare('SELECT id FROM dict_groups ORDER BY position LIMIT 1').get();
    if (firstGroup) {
      d.prepare('INSERT OR IGNORE INTO dict_group_sources (group_id, source) VALUES (?, ?)').run(firstGroup.id, src);
    }
    syncPersonalJson(dictId);
    return dictId;
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
    throw e;
  }
}

function renamePersonalDict(dictId, newName) {
  const d = getDb();
  const old = d.prepare('SELECT name FROM personal_dicts WHERE id = ?').get(dictId);
  if (!old) return false;
  try {
    d.prepare('UPDATE personal_dicts SET name = ? WHERE id = ?').run(newName, dictId);
  } catch (e) {
    return false;
  }
  // Renommer le fichier JSON
  const oldPath = path.join(DB_DIR, `${old.name}.json`);
  const newPath = path.join(DB_DIR, `${newName}.json`);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath);
  }
  return true;
}

function deletePersonalDict(dictId) {
  const d = getDb();
  const row = d.prepare('SELECT name FROM personal_dicts WHERE id = ?').get(dictId);
  const name = row ? row.name : null;
  const src = `personnel_${dictId}`;
  d.prepare('DELETE FROM dictionnaire_perso WHERE dict_id = ?').run(dictId);
  d.prepare('DELETE FROM personal_dicts WHERE id = ?').run(dictId);
  d.prepare('DELETE FROM dict_settings WHERE source = ?').run(src);
  d.prepare('DELETE FROM dict_group_sources WHERE source = ?').run(src);
  if (name) {
    const jsonPath = path.join(DB_DIR, `${name}.json`);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  }
  return true;
}

function getPersonalDictName(dictId) {
  const row = getDb().prepare('SELECT name FROM personal_dicts WHERE id = ?').get(dictId);
  return row ? row.name : null;
}

// ========== MOTS PERSONNELS ==========

function addPersonalWord(mot, definitions = [], categorie = '', notes = '', dictId = 1, autoSync = true) {
  const d = getDb();
  const motNorm = normalizeForGrid(mot);
  const catNorm = normalizeForGrid(categorie);
  const defsJson = JSON.stringify(definitions);
  try {
    d.prepare(
      'INSERT INTO dictionnaire_perso (dict_id, mot, mot_upper, definitions, categorie, notes) VALUES (?,?,?,?,?,?)'
    ).run(dictId, motNorm, motNorm, defsJson, catNorm, notes);
    if (autoSync) syncPersonalJson(dictId);
    return true;
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
    return null;
  }
}

function updatePersonalWord(mot, { definitions, categorie, notes, newMot } = {}, dictId = 1) {
  const d = getDb();
  const motUpper = normalizeForGrid(mot);
  const updates = [];
  const params = [];

  if (definitions !== undefined) { updates.push('definitions = ?'); params.push(JSON.stringify(definitions)); }
  if (categorie !== undefined) { updates.push('categorie = ?'); params.push(normalizeForGrid(categorie)); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (newMot !== undefined) {
    const newMotNorm = normalizeForGrid(newMot);
    updates.push('mot = ?'); params.push(newMotNorm);
    updates.push('mot_upper = ?'); params.push(newMotNorm);
  }
  updates.push("date_modif = date('now')");
  params.push(dictId, motUpper);

  d.prepare(`UPDATE dictionnaire_perso SET ${updates.join(', ')} WHERE dict_id = ? AND mot_upper = ?`).run(...params);
  syncPersonalJson(dictId);
}

function deletePersonalWord(mot, dictId = 1) {
  getDb().prepare('DELETE FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper = ?')
    .run(dictId, normalizeForSearch(mot));
  syncPersonalJson(dictId);
}

function getCategories() {
  return getDb().prepare(
    "SELECT categorie, COUNT(*) as cnt FROM dictionnaire_perso WHERE categorie != '' GROUP BY categorie ORDER BY cnt DESC"
  ).all();
}

function getPersonalWords(search = '', limit = 500, dictId = 1) {
  const d = getDb();
  if (search) {
    const searchUpper = normalizeForSearch(search);
    return d.prepare(
      'SELECT * FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper LIKE ? ORDER BY mot_upper LIMIT ?'
    ).all(dictId, `%${searchUpper}%`, limit);
  }
  return d.prepare(
    'SELECT * FROM dictionnaire_perso WHERE dict_id = ? ORDER BY mot_upper LIMIT ?'
  ).all(dictId, limit);
}

function getPersonalWord(mot, dictId = null) {
  const d = getDb();
  const motUpper = normalizeForSearch(mot);
  if (dictId !== null) {
    return d.prepare('SELECT * FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper = ?').get(dictId, motUpper) || null;
  }
  return d.prepare('SELECT * FROM dictionnaire_perso WHERE mot_upper = ? ORDER BY dict_id LIMIT 1').get(motUpper) || null;
}

// ========== BROWSE DICTIONNAIRE ==========

function browseDictionary(source, search = '', limit = 500) {
  const d = getDb();
  const searchUpper = search ? normalizeForGrid(search) : '';

  // Si pas de recherche, retourner tous les mots par ordre alphabétique
  if (!searchUpper) {
    if (source.startsWith('personnel_')) {
      const dictId = parseInt(source.split('_')[1]);
      const rows = d.prepare('SELECT mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id = ? ORDER BY mot_upper LIMIT ?').all(dictId, limit);
      const toEntry = row => { const defs = row.definitions ? JSON.parse(row.definitions) : []; return { mot: row.mot_upper, definition: defs[0] || '', categorie: row.categorie }; };
      return { all: rows.map(toEntry) };
    } else if (source === 'lexique') {
      const rows = d.prepare('SELECT DISTINCT ortho_upper, lemme, cgram FROM lexique ORDER BY ortho_upper LIMIT ?').all(limit);
      return { all: rows.map(row => ({ mot: row.ortho_upper, definition: row.lemme, categorie: row.cgram })) };
    } else {
      const rows = d.prepare('SELECT DISTINCT mot_grid, definition, categorie FROM external_words WHERE source = ? ORDER BY mot_grid LIMIT ?').all(source, limit);
      return { all: rows.map(row => ({ mot: row.mot_grid, definition: row.definition, categorie: row.categorie })) };
    }
  }

  const startsLike = searchUpper + '%';
  const containsLike = '%' + searchUpper + '%';

  if (source.startsWith('personnel_')) {
    const dictId = parseInt(source.split('_')[1]);
    const startsRows = d.prepare(
      'SELECT mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper LIKE ? ORDER BY mot_upper LIMIT ?'
    ).all(dictId, startsLike, limit);
    const containsRows = d.prepare(
      'SELECT mot_upper, definitions, categorie FROM dictionnaire_perso WHERE dict_id = ? AND mot_upper LIKE ? AND mot_upper NOT LIKE ? ORDER BY mot_upper LIMIT ?'
    ).all(dictId, containsLike, startsLike, limit);
    const toEntry = row => {
      const defs = row.definitions ? JSON.parse(row.definitions) : [];
      return { mot: row.mot_upper, definition: defs[0] || '', categorie: row.categorie };
    };
    return { starts: startsRows.map(toEntry), contains: containsRows.map(toEntry) };

  } else if (source === 'lexique') {
    const startsRows = d.prepare(
      'SELECT DISTINCT ortho_upper, lemme, cgram FROM lexique WHERE ortho_upper LIKE ? ORDER BY ortho_upper LIMIT ?'
    ).all(startsLike, limit);
    const containsRows = d.prepare(
      'SELECT DISTINCT ortho_upper, lemme, cgram FROM lexique WHERE ortho_upper LIKE ? AND ortho_upper NOT LIKE ? ORDER BY ortho_upper LIMIT ?'
    ).all(containsLike, startsLike, limit);
    const toEntry = row => ({ mot: row.ortho_upper, definition: row.lemme, categorie: row.cgram });
    return { starts: startsRows.map(toEntry), contains: containsRows.map(toEntry) };

  } else {
    const startsRows = d.prepare(
      'SELECT DISTINCT mot_grid, definition, categorie FROM external_words WHERE source = ? AND mot_grid LIKE ? ORDER BY mot_grid LIMIT ?'
    ).all(source, startsLike, limit);
    const containsRows = d.prepare(
      'SELECT DISTINCT mot_grid, definition, categorie FROM external_words WHERE source = ? AND mot_grid LIKE ? AND mot_grid NOT LIKE ? ORDER BY mot_grid LIMIT ?'
    ).all(source, containsLike, startsLike, limit);
    const toEntry = row => ({ mot: row.mot_grid, definition: row.definition, categorie: row.categorie });
    return { starts: startsRows.map(toEntry), contains: containsRows.map(toEntry) };
  }
}

// ========== SYNC JSON ==========

function syncPersonalJson(dictId) {
  try {
    const name = getPersonalDictName(dictId);
    if (!name) return;
    const filepath = path.join(DB_DIR, `${name}.json`);
    exportPersonalDictionary(filepath, dictId);
  } catch (e) {
    console.error(`Erreur sync JSON (dict ${dictId}):`, e.message);
  }
}

function exportPersonalDictionary(filepath, dictId = 1) {
  const rows = getDb().prepare(
    'SELECT * FROM dictionnaire_perso WHERE dict_id = ? ORDER BY mot_upper'
  ).all(dictId);

  const data = {
    format: 'verbicruciste_dictionnaire',
    version: 1,
    nombre_mots: rows.length,
    mots: rows.map(r => ({
      mot: r.mot,
      definitions: r.definitions ? JSON.parse(r.definitions) : [],
      categorie: r.categorie,
      notes: r.notes,
      date_ajout: r.date_ajout,
      date_modif: r.date_modif
    }))
  };

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return rows.length;
}

function importPersonalDictionary(filepath, dictId = 1) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const data = JSON.parse(content);
  if (data.format !== 'verbicruciste_dictionnaire') {
    throw new Error('Format de fichier non reconnu');
  }
  let count = 0;
  for (const entry of (data.mots || [])) {
    const success = addPersonalWord(
      entry.mot,
      entry.definitions || [],
      entry.categorie || '',
      entry.notes || '',
      dictId,
      false // pas de sync à chaque mot
    );
    if (success === true) count++;
  }
  if (count > 0) syncPersonalJson(dictId);
  return count;
}

// ========== GRILLES ==========

function saveGrid(nom, jsonData, terminee = false) {
  const d = getDb();
  const existing = d.prepare('SELECT id FROM grilles WHERE nom = ?').get(nom);
  const jsonStr = JSON.stringify(jsonData);
  if (existing) {
    d.prepare("UPDATE grilles SET json_data = ?, terminee = ?, date_modif = datetime('now') WHERE nom = ?")
      .run(jsonStr, terminee ? 1 : 0, nom);
  } else {
    d.prepare('INSERT INTO grilles (nom, json_data, terminee) VALUES (?,?,?)')
      .run(nom, jsonStr, terminee ? 1 : 0);
  }
}

function loadGrid(nom) {
  const row = getDb().prepare('SELECT * FROM grilles WHERE nom = ?').get(nom);
  if (!row) return null;
  return { ...row, json_data: JSON.parse(row.json_data) };
}

function listGrids() {
  return getDb().prepare('SELECT id, nom, terminee, date_creation, date_modif FROM grilles ORDER BY date_modif DESC').all();
}

function listGridsFull() {
  return getDb().prepare('SELECT id, nom, json_data, terminee, date_creation, date_modif FROM grilles ORDER BY date_modif DESC').all();
}

function deleteGrid(nom) {
  getDb().prepare('DELETE FROM grilles WHERE nom = ?').run(nom);
}

// ========== MÉMOS ==========

function getMemos(search = '') {
  const d = getDb();
  if (!search) {
    return d.prepare('SELECT * FROM memos ORDER BY date_modif DESC').all();
  }
  const q = `%${search.toUpperCase()}%`;
  return d.prepare(
    "SELECT * FROM memos WHERE UPPER(mot) LIKE ? OR UPPER(note) LIKE ? ORDER BY date_modif DESC"
  ).all(q, q);
}

function addMemo(mot, dictTarget, categorie, note) {
  return getDb().prepare(
    "INSERT INTO memos (mot, dict_target, categorie, note) VALUES (?, ?, ?, ?)"
  ).run(mot || '', dictTarget || '', categorie || '', note || '');
}

function updateMemo(id, mot, dictTarget, categorie, note) {
  getDb().prepare(
    "UPDATE memos SET mot = ?, dict_target = ?, categorie = ?, note = ?, date_modif = datetime('now') WHERE id = ?"
  ).run(mot || '', dictTarget || '', categorie || '', note || '', id);
}

function deleteMemo(id) {
  getDb().prepare('DELETE FROM memos WHERE id = ?').run(id);
}

// ========== STATISTIQUES ==========

function getLexiqueStats() {
  const d = getDb();
  const total = d.prepare('SELECT COUNT(*) as cnt FROM lexique').get().cnt;
  const distinct = d.prepare('SELECT COUNT(DISTINCT ortho_upper) as cnt FROM lexique').get().cnt;
  return { total_entries: total, distinct_words: distinct };
}

function getPersonalStats(dictId = null) {
  const d = getDb();
  const total = dictId !== null
    ? d.prepare('SELECT COUNT(*) as cnt FROM dictionnaire_perso WHERE dict_id = ?').get(dictId).cnt
    : d.prepare('SELECT COUNT(*) as cnt FROM dictionnaire_perso').get().cnt;
  return { total_words: total };
}

function getExternalCount(source) {
  return getDb().prepare('SELECT COUNT(*) as cnt FROM external_words WHERE source = ?').get(source).cnt;
}

function updateDictCount(source, count) {
  getDb().prepare('UPDATE dict_settings SET word_count = ? WHERE source = ?').run(count, source);
}

// ========== LOCUTIONS ==========

function getLocutionsCount() {
  return getDb().prepare('SELECT COUNT(*) as cnt FROM locutions').get().cnt;
}

/**
 * Parse a search term with optional / modifiers:
 *   MAIN    → exact word match (word boundary both sides)
 *   MAIN/   → prefix match (word starts with MAIN)
 *   /MAIN   → suffix match (word ends with MAIN)
 *   /MAIN/  → contains match (MAIN anywhere in a word)
 * Returns { core, mode } where mode is 'exact'|'prefix'|'suffix'|'contains'
 */
function parseLocutionTerm(term) {
  const startsSlash = term.startsWith('/');
  const endsSlash = term.endsWith('/');
  let core = term;
  if (startsSlash) core = core.slice(1);
  if (endsSlash) core = core.slice(0, -1);
  if (!core) return null;

  let mode = 'exact';
  if (startsSlash && endsSlash) mode = 'contains';
  else if (endsSlash) mode = 'prefix';
  else if (startsSlash) mode = 'suffix';
  return { core: stripAccents(core.toUpperCase()), mode };
}

/**
 * Build a SQL LIKE condition for a single term against a given column.
 * We use expression_upper (uppercase, no accents) for matching.
 * Word boundaries are approximated with spaces (expressions are space-separated).
 */
function buildLocutionLikeCondition(parsed, column) {
  const c = parsed.core;
  switch (parsed.mode) {
    case 'exact':
      // Must match as a whole word: could be start, middle, or end of the expression
      // (space)WORD(space) OR ^WORD(space) OR (space)WORD$ OR ^WORD$
      return { sql: `(${column} LIKE ? OR ${column} LIKE ? OR ${column} LIKE ? OR ${column} = ?)`, params: [`% ${c} %`, `${c} %`, `% ${c}`, c] };
    case 'prefix':
      // Word starts with c: (space)c... or ^c...
      return { sql: `(${column} LIKE ? OR ${column} LIKE ?)`, params: [`% ${c}%`, `${c}%`] };
    case 'suffix':
      // Word ends with c: ...c(space) or ...c$
      return { sql: `(${column} LIKE ? OR ${column} LIKE ?)`, params: [`%${c} %`, `%${c}`] };
    case 'contains':
      // c anywhere in any word
      return { sql: `${column} LIKE ?`, params: [`%${c}%`] };
  }
}

function searchLocutions(keyword, limit = 200, offset = 0, categories = null, searchIn = ['expression']) {
  const d = getDb();
  const input = keyword.trim();
  const params = [];
  let where = [];

  if (input) {
    const terms = input.split(/\s+/).filter(Boolean);
    for (const term of terms) {
      const parsed = parseLocutionTerm(term);
      if (!parsed) continue;

      const fieldConditions = [];
      for (const field of searchIn) {
        const col = field === 'expression' ? 'expression_upper' : 'UPPER(definition)';
        const cond = buildLocutionLikeCondition(parsed, col);
        fieldConditions.push(cond.sql);
        params.push(...cond.params);
      }
      // OR between fields (expression OR definition), AND between terms
      where.push(`(${fieldConditions.join(' OR ')})`);
    }
  }

  if (categories && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    where.push(`categorie IN (${placeholders})`);
    params.push(...categories);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const total = d.prepare(`SELECT COUNT(*) as cnt FROM locutions ${whereClause}`).get(...params).cnt;
  const rows = d.prepare(`SELECT expression, categorie, definition FROM locutions ${whereClause} ORDER BY expression_upper LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { rows, total };
}

function getLocutionsCategories() {
  return getDb().prepare('SELECT categorie, COUNT(*) as cnt FROM locutions GROUP BY categorie ORDER BY cnt DESC').all();
}

function randomLocutions(count = 10) {
  return getDb().prepare('SELECT expression, categorie, definition FROM locutions WHERE definition != \'\' ORDER BY RANDOM() LIMIT ?').all(count);
}

// ========== TÉLÉCHARGEMENTS EXTERNES ==========

function clearExternalSource(source) {
  getDb().prepare('DELETE FROM external_words WHERE source = ?').run(source);
}

function insertExternalBatch(batch) {
  const d = getDb();
  const ins = d.prepare(
    'INSERT INTO external_words (mot, mot_upper, mot_grid, definition, categorie, source, nblettres) VALUES (?,?,?,?,?,?,?)'
  );
  const runBatch = d.transaction((items) => {
    for (const item of items) ins.run(...item);
  });
  runBatch(batch);
}

// Fonctions de téléchargement — utilisent fetch (Node 18+)

async function fetchWithRetry(url, maxRetries = 5, progressCallback = null) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Verbicruciste/1.0' },
        signal: AbortSignal.timeout(20000)
      });
      if (resp.status === 429 && attempt < maxRetries - 1) {
        const wait = 5000 * (attempt + 1);
        if (progressCallback) progressCallback(`Rate limit — pause ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      if (progressCallback) progressCallback(`Tentative ${attempt + 2}...`);
    }
  }
  return null;
}

async function fetchBuffer(url, timeout = 30000) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Verbicruciste/1.0' },
    signal: AbortSignal.timeout(timeout)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function downloadSigles(progressCallback = null) {
  const seen = new Set();
  let batch = [];
  let total = 0;
  let cleared = false;

  // 1. Wiktionnaire
  for (const category of ['Sigles en français', 'Acronymes en français']) {
    if (progressCallback) progressCallback(`Wiktionnaire : ${category}...`);
    try {
      let url = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0`;
      while (url) {
        const data = await fetchWithRetry(url, 5, progressCallback);
        if (!data) break;
        for (const member of (data.query?.categorymembers || [])) {
          const title = member.title;
          const grid = normalizeForGrid(title);
          if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
            seen.add(grid);
            batch.push([title, title.toUpperCase(), grid, `Sigle : ${title}`, 'SIG', 'sigles', grid.length]);
            total++;
            if (batch.length >= 500) {
              if (!cleared) { clearExternalSource('sigles'); cleared = true; }
              insertExternalBatch(batch);
              batch = [];
              if (progressCallback) progressCallback(`${total} sigles...`);
            }
          }
        }
        const cont = data.continue?.cmcontinue;
        if (cont) {
          url = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0&cmcontinue=${cont}`;
          await new Promise(r => setTimeout(r, 300));
        } else {
          url = null;
        }
      }
    } catch (e) {
      if (progressCallback) progressCallback(`Erreur Wiktionnaire (${category}): ${e.message}`);
    }
  }

  // 2. Wikipedia — listes de sigles
  const titles = {
    2: 'Liste_de_sigles_de_deux_caract%C3%A8res',
    3: 'Liste_de_sigles_de_trois_caract%C3%A8res',
    4: 'Liste_de_sigles_de_quatre_caract%C3%A8res',
    5: 'Liste_de_sigles_de_cinq_caract%C3%A8res',
  };
  for (const length of [2, 3, 4, 5]) {
    if (progressCallback) progressCallback(`Wikipedia : sigles de ${length} lettres...`);
    try {
      const apiUrl = `https://fr.wikipedia.org/w/api.php?action=parse&page=${titles[length]}&prop=wikitext&format=json`;
      const data = await fetchWithRetry(apiUrl, 3, progressCallback);
      const wikitext = data?.parse?.wikitext?.['*'] || '';
      for (const line of wikitext.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith(';')) {
          let match = trimmed.match(/[*;]+\s*\[\[([A-ZÀ-Ÿ0-9]+)\]\]/);
          if (!match) match = trimmed.match(/[*;]+\s*'*([A-ZÀ-Ÿ]{2,6})'*/);
          if (match) {
            const sigle = match[1];
            const grid = normalizeForGrid(sigle);
            if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
              seen.add(grid);
              let defn = trimmed.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
                .replace(/[*;]+\s*/, '').trim().slice(0, 100);
              batch.push([sigle, sigle.toUpperCase(), grid, defn || `Sigle : ${sigle}`, 'SIG', 'sigles', grid.length]);
              total++;
            }
          }
        }
      }
    } catch (e) {
      if (progressCallback) progressCallback(`Erreur Wikipedia sigles ${length}L: ${e.message}`);
    }
  }

  if (batch.length > 0) {
    if (!cleared) { clearExternalSource('sigles'); cleared = true; }
    insertExternalBatch(batch);
  }
  if (cleared) {
    updateDictCount('sigles', total);
    setSourceEnabled('sigles', true);
  } else {
    if (progressCallback) progressCallback('Aucun sigle récupéré (rate-limit). Réessayez plus tard.');
  }
  return total;
}

async function downloadCommunes(progressCallback = null) {
  clearExternalSource('communes');
  if (progressCallback) progressCallback('Téléchargement des communes...');
  const seen = new Set();
  let batch = [];
  let total = 0;

  try {
    const url = 'https://www.data.gouv.fr/fr/datasets/r/dbe8a621-a9c4-4bc3-9cae-be1699c5ff25';
    const resp = await fetch(url, { headers: { 'User-Agent': 'Verbicruciste/1.0' }, signal: AbortSignal.timeout(30000) });
    const content = await resp.text();
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Simple CSV parser (les communes peuvent contenir des virgules dans les guillemets)
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

      const nom = row.nom_commune_complet || row.nom_commune || row.nom || '';
      if (!nom) continue;
      const dept = row.code_departement || row.nom_departement || '';
      const grid = normalizeForGrid(nom);
      if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
        seen.add(grid);
        const defn = dept ? `Commune (${dept})` : 'Commune de France';
        batch.push([nom, nom.toUpperCase(), grid, defn, 'GEO', 'communes', grid.length]);
        total++;
        if (batch.length >= 2000) {
          insertExternalBatch(batch);
          batch = [];
          if (progressCallback) progressCallback(`${total} communes...`);
        }
      }
    }
  } catch (e) {
    if (progressCallback) progressCallback(`Erreur data.gouv.fr: ${e.message}`);
  }

  if (batch.length > 0) insertExternalBatch(batch);
  updateDictCount('communes', total);
  setSourceEnabled('communes', true);
  return total;
}

async function downloadPrenoms(progressCallback = null) {
  clearExternalSource('prenoms');
  if (progressCallback) progressCallback('Téléchargement des prénoms INSEE...');
  const seen = new Set();
  let batch = [];
  let total = 0;

  const urls = [
    'https://www.insee.fr/fr/statistiques/fichier/8595130/nat2023_csv.zip',
    'https://www.insee.fr/fr/statistiques/fichier/7633685/nat2022_csv.zip',
    'https://www.insee.fr/fr/statistiques/fichier/2540004/nat2021_csv.zip',
  ];

  let downloaded = false;
  for (const url of urls) {
    try {
      if (progressCallback) progressCallback(`Tentative INSEE : ${url.split('/').pop()}...`);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        signal: AbortSignal.timeout(30000)
      });
      const zipBuffer = Buffer.from(await resp.arrayBuffer());
      // Décompresser avec yauzl ou en utilisant le module zlib de Node
      const AdmZip = require('adm-zip');  // fallback: on parsera le CSV directement
      // Note: si adm-zip n'est pas dispo, on utilise une autre méthode
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      const csvEntry = entries.find(e => e.entryName.endsWith('.csv'));
      if (!csvEntry) continue;
      const content = csvEntry.getData().toString('utf-8');

      const firstLine = content.split('\n')[0];
      const delimiter = firstLine.includes(';') ? ';' : ',';
      const csvLines = content.split('\n');
      const csvHeaders = csvLines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));

      for (let i = 1; i < csvLines.length; i++) {
        if (!csvLines[i].trim()) continue;
        const values = csvLines[i].split(delimiter).map(v => v.trim().replace(/"/g, ''));
        const row = {};
        csvHeaders.forEach((h, idx) => { row[h] = values[idx] || ''; });

        const prenom = (row.preusuel || row['prénom'] || '').trim();
        if (!prenom || prenom === '_PRENOMS_RARES') continue;
        const sexe = row.sexe || '';
        const genre = sexe === '1' ? 'Masculin' : sexe === '2' ? 'Féminin' : '';
        const grid = normalizeForGrid(prenom);
        if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
          seen.add(grid);
          const defn = genre ? `Prénom ${genre.toLowerCase()}` : 'Prénom';
          batch.push([prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase(), prenom.toUpperCase(), grid, defn, 'PRE', 'prenoms', grid.length]);
          total++;
          if (batch.length >= 1000) {
            insertExternalBatch(batch);
            batch = [];
            if (progressCallback) progressCallback(`${total} prénoms...`);
          }
        }
      }
      downloaded = true;
      break;
    } catch (e) {
      if (progressCallback) progressCallback(`Erreur ${url.split('/').pop()}: ${e.message}`);
    }
  }

  if (!downloaded) {
    // Fallback Wikidata
    if (progressCallback) progressCallback('Fallback Wikidata pour les prénoms...');
    try {
      const query = `SELECT DISTINCT ?itemLabel WHERE { ?item wdt:P31 wd:Q202444 . SERVICE wikibase:label { bd:serviceParam wikibase:language "fr" } } LIMIT 10000`;
      const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
      const data = await fetchWithRetry(url, 3, progressCallback);
      for (const result of (data?.results?.bindings || [])) {
        const prenom = result.itemLabel?.value || '';
        if (!prenom || prenom.startsWith('Q')) continue;
        const grid = normalizeForGrid(prenom);
        if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
          seen.add(grid);
          batch.push([prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase(), prenom.toUpperCase(), grid, 'Prénom', 'PRE', 'prenoms', grid.length]);
          total++;
        }
      }
    } catch (e) {
      if (progressCallback) progressCallback(`Erreur fallback Wikidata: ${e.message}`);
    }
  }

  if (batch.length > 0) insertExternalBatch(batch);
  updateDictCount('prenoms', total);
  setSourceEnabled('prenoms', true);
  return total;
}

async function downloadToponymes(progressCallback = null) {
  clearExternalSource('toponymes');
  if (progressCallback) progressCallback('Téléchargement GeoNames FR...');
  const seen = new Set();
  let batch = [];
  let total = 0;

  const featureLabels = {
    H: "Cours d'eau", T: 'Relief', L: 'Région/Zone',
    S: 'Monument', V: 'Forêt/Végétation', U: 'Sous-marin',
  };

  try {
    const zipBuffer = await fetchBuffer('https://download.geonames.org/export/dump/FR.zip', 60000);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipBuffer);
    const entry = zip.getEntry('FR.txt');
    const content = entry.getData().toString('utf-8');
    const lines = content.split('\n');

    if (progressCallback) progressCallback(`Traitement de ${lines.length} entrées GeoNames...`);

    for (const line of lines) {
      const fields = line.split('\t');
      if (fields.length < 8) continue;
      const name = fields[1];
      const featureClass = fields[6];
      if (!(featureClass in featureLabels)) continue;
      const grid = normalizeForGrid(name);
      if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
        seen.add(grid);
        batch.push([name, name.toUpperCase(), grid, featureLabels[featureClass], 'GEO', 'toponymes', grid.length]);
        total++;
        if (batch.length >= 2000) {
          insertExternalBatch(batch);
          batch = [];
          if (progressCallback) progressCallback(`${total} toponymes...`);
        }
      }
    }
  } catch (e) {
    if (progressCallback) progressCallback(`Erreur GeoNames: ${e.message}`);
  }

  if (batch.length > 0) insertExternalBatch(batch);
  updateDictCount('toponymes', total);
  setSourceEnabled('toponymes', true);
  return total;
}

async function downloadPersonnalites(progressCallback = null) {
  clearExternalSource('personnalites');
  if (progressCallback) progressCallback('Wikidata : personnalités françaises...');
  const seen = new Set();
  let batch = [];
  let total = 0;

  const queries = [
    ['Personnalités françaises', `SELECT ?itemLabel ?itemDescription WHERE { ?item wdt:P31 wd:Q5 ; wdt:P27 wd:Q142 . ?item wikibase:sitelinks ?slinks . FILTER(?slinks > 5) SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" } } LIMIT 8000`],
    ['Personnalités internationales', `SELECT ?itemLabel ?itemDescription WHERE { ?item wdt:P31 wd:Q5 . ?item wikibase:sitelinks ?slinks . FILTER(?slinks > 30) SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" } } LIMIT 8000`],
  ];

  for (const [label, query] of queries) {
    if (progressCallback) progressCallback(`Wikidata : ${label}...`);
    try {
      const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query.trim())}&format=json`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Verbicruciste/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(60000)
      });
      const data = await resp.json();

      for (const result of (data.results?.bindings || [])) {
        const name = result.itemLabel?.value || '';
        const desc = result.itemDescription?.value || '';
        if (!name || name.startsWith('Q')) continue;

        const parts = name.split(' ');
        const namesToAdd = [name];
        if (parts.length >= 2) namesToAdd.push(parts[parts.length - 1]);

        for (const n of namesToAdd) {
          const grid = normalizeForGrid(n);
          if (grid.length >= 2 && /^[A-Z]+$/.test(grid) && !seen.has(grid)) {
            seen.add(grid);
            const defn = (desc && !desc.startsWith('Q')) ? desc.slice(0, 100) : `Personnalité : ${name}`;
            batch.push([n, n.toUpperCase(), grid, defn, 'NP', 'personnalites', grid.length]);
            total++;
            if (batch.length >= 1000) {
              insertExternalBatch(batch);
              batch = [];
              if (progressCallback) progressCallback(`${total} personnalités...`);
            }
          }
        }
      }
    } catch (e) {
      if (progressCallback) progressCallback(`Erreur Wikidata (${label}): ${e.message}`);
    }
  }

  if (batch.length > 0) insertExternalBatch(batch);
  updateDictCount('personnalites', total);
  setSourceEnabled('personnalites', true);
  return total;
}

async function downloadWikipedia(progressCallback = null) {
  const jsonPath = path.join(DB_DIR, 'dictionnaire_wikipedia.json');
  if (!fs.existsSync(jsonPath)) {
    if (progressCallback) progressCallback('Erreur : dictionnaire_wikipedia.json introuvable');
    return 0;
  }
  if (progressCallback) progressCallback('Chargement du dictionnaire Wikipedia...');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  if (!data || Object.keys(data).length === 0) {
    if (progressCallback) progressCallback('Fichier vide');
    return 0;
  }

  clearExternalSource('wikipedia');
  let batch = [];
  let count = 0;
  const totalEntries = Object.keys(data).length;

  for (const [motUpper, definition] of Object.entries(data)) {
    if (motUpper.length < 2) continue;
    batch.push([motUpper, motUpper, motUpper, definition || '', '', 'wikipedia', motUpper.length]);
    count++;
    if (batch.length >= 5000) {
      insertExternalBatch(batch);
      batch = [];
      if (progressCallback) progressCallback(`Wikipedia : ${count}/${totalEntries} mots importés...`);
    }
  }

  if (batch.length > 0) insertExternalBatch(batch);
  updateDictCount('wikipedia', count);
  if (progressCallback) progressCallback(`Wikipedia : ${count} mots importés !`);
  return count;
}

function extractWiktDefinition(wikitext) {
  const defs = [];
  for (const line of wikitext.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') && !trimmed.startsWith('##') && !trimmed.startsWith('#*') && !trimmed.startsWith('#:')) {
      let d = trimmed.replace(/^#+/, '').trim();
      d = d.replace(/\{\{[^}]*\}\}/g, '');
      d = d.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
      d = d.replace(/'{2,}/g, '');
      d = d.replace(/<[^>]+>/g, '');
      d = d.replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
      if (d && d.length > 3) defs.push(d);
    }
  }
  return defs.slice(0, 3).join(' / ');
}

async function downloadLocutions(progressCallback = null) {
  let firstBatchReceived = false;

  const categories = {
    'Locutions nominales en français': 'Loc. nominale',
    'Locutions verbales en français': 'Loc. verbale',
    'Locutions adverbiales en français': 'Loc. adverbiale',
    'Locutions adjectivales en français': 'Loc. adjectivale',
    'Locutions prépositives en français': 'Loc. prépositive',
    'Locutions interjectives en français': 'Loc. interjective',
    'Locutions conjonctives en français': 'Loc. conjonctive',
    'Proverbes en français': 'Proverbe',
  };

  let batch = [];
  let total = 0;
  const seen = new Set();
  const d = getDb();

  for (const [category, catLabel] of Object.entries(categories)) {
    if (progressCallback) progressCallback(`Wiktionnaire : ${category}...`);
    let catErrors = 0;
    let url = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0`;

    while (url) {
      let data;
      try {
        data = await fetchWithRetry(url, 5, progressCallback);
      } catch (e) {
        catErrors++;
        if (catErrors >= 3) {
          if (progressCallback) progressCallback(`Trop d'erreurs pour ${category}, passage à la suivante.`);
          break;
        }
        continue;
      }
      if (!data) break;

      for (const member of (data.query?.categorymembers || [])) {
        const title = member.title;
        const titleUpper = title.toUpperCase();
        if (!seen.has(titleUpper)) {
          seen.add(titleUpper);
          batch.push([title, titleUpper, catLabel, '']);
          total++;
          if (batch.length >= 500) {
            if (!firstBatchReceived) {
              d.prepare('DELETE FROM locutions').run();
              firstBatchReceived = true;
            }
            const insLoc = d.prepare('INSERT INTO locutions (expression, expression_upper, categorie, definition) VALUES (?, ?, ?, ?)');
            const runBatch = d.transaction((items) => { for (const item of items) insLoc.run(...item); });
            runBatch(batch);
            batch = [];
            if (progressCallback) progressCallback(`${total} locutions...`);
          }
        }
      }

      const cont = data.continue?.cmcontinue;
      if (cont) {
        url = `https://fr.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Cat%C3%A9gorie:${encodeURIComponent(category)}&cmlimit=500&format=json&cmnamespace=0&cmcontinue=${encodeURIComponent(cont)}`;
        await new Promise(r => setTimeout(r, 300));
      } else {
        url = null;
      }
    }
  }

  if (batch.length > 0) {
    if (!firstBatchReceived) {
      d.prepare('DELETE FROM locutions').run();
      firstBatchReceived = true;
    }
    const insLoc = d.prepare('INSERT INTO locutions (expression, expression_upper, categorie, definition) VALUES (?, ?, ?, ?)');
    const runBatch = d.transaction((items) => { for (const item of items) insLoc.run(...item); });
    runBatch(batch);
  }

  if (!firstBatchReceived) {
    if (progressCallback) progressCallback("Aucune locution récupérée (rate-limit). Réessayez plus tard.");
    return 0;
  }

  if (progressCallback) progressCallback(`${total} locutions collectées. Récupération des définitions...`);

  // 2e passe : récupérer les définitions
  const allExpressions = d.prepare("SELECT id, expression FROM locutions WHERE definition = ''").all();
  let doneDefs = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < allExpressions.length; i += 50) {
    const batchExprs = allExpressions.slice(i, i + 50);
    const titlesMap = {};
    for (const row of batchExprs) titlesMap[row.expression] = row.id;
    const titlesStr = Object.keys(titlesMap).join('|');

    try {
      const apiUrl = `https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titlesStr)}&format=json`;
      const data = await fetchWithRetry(apiUrl, 5, progressCallback);
      consecutiveErrors = 0;

      if (data) {
        for (const [pid, page] of Object.entries(data.query?.pages || {})) {
          const title = page.title || '';
          if (title in titlesMap) {
            const content = page.revisions?.[0]?.slots?.main?.['*'] || '';
            const defn = extractWiktDefinition(content);
            if (defn) {
              d.prepare('UPDATE locutions SET definition = ? WHERE id = ?').run(defn, titlesMap[title]);
            }
          }
        }
      }
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        if (progressCallback) progressCallback(`Trop d'erreurs consécutives, arrêt des définitions à ${doneDefs}/${allExpressions.length}`);
        break;
      }
    }

    doneDefs += batchExprs.length;
    if (doneDefs % 500 === 0 || doneDefs === allExpressions.length) {
      if (progressCallback) progressCallback(`Définitions : ${doneDefs}/${allExpressions.length}...`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (progressCallback) progressCallback(`Terminé : ${total} locutions avec définitions.`);
  return total;
}

// Mapping source → fonction de téléchargement
async function downloadLexique(progressCallback = null) {
  if (progressCallback) progressCallback('Importation du Lexique 3...');
  const total = importLexique(progressCallback, true);
  return total;
}

function deleteExternalSource(source) {
  const d = getDb();
  if (source === 'lexique') {
    d.exec('DELETE FROM lexique');
    d.prepare("UPDATE dict_settings SET word_count = 0 WHERE source = 'lexique'").run();
  } else {
    d.prepare('DELETE FROM external_words WHERE source = ?').run(source);
    d.prepare('UPDATE dict_settings SET word_count = 0 WHERE source = ?').run(source);
  }
}

const DOWNLOAD_FUNCTIONS = {
  lexique: downloadLexique,
  sigles: downloadSigles,
  communes: downloadCommunes,
  prenoms: downloadPrenoms,
  toponymes: downloadToponymes,
  personnalites: downloadPersonnalites,
  wikipedia: downloadWikipedia,
};

// ========== UTILITAIRE CSV ==========

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else { current += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

// ========== LEXIQUE IMPORT ==========

function importLexique(progressCallback = null, force = false) {
  const d = getDb();
  const count = d.prepare('SELECT COUNT(*) as cnt FROM lexique').get().cnt;
  if (count > 0 && !force) return count;
  if (force) d.exec('DELETE FROM lexique');

  if (!fs.existsSync(LEXIQUE_PATH)) throw new Error(`Fichier Lexique introuvable : ${LEXIQUE_PATH}`);

  const content = fs.readFileSync(LEXIQUE_PATH, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split('\t');
  const seen = new Set();
  let batch = [];
  let total = 0;

  const ins = d.prepare(
    'INSERT INTO lexique (ortho, lemme, cgram, genre, nombre, infover, nblettres, ortho_upper) VALUES (?,?,?,?,?,?,?,?)'
  );
  const runBatch = d.transaction((items) => { for (const item of items) ins.run(...item); });

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split('\t');
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });

    const ortho = row.ortho || '';
    if (!ortho || ortho.includes(' ')) continue;
    if (!/^[a-zàâäéèêëïîôùûüÿçæœ\-']+$/i.test(ortho)) continue;

    const lemme = row.lemme || '';
    const cgram = row.cgram || '';
    const genre = row.genre || '';
    const nombre = row.nombre || '';
    const infover = row.infover || '';
    const orthoUpper = normalizeForGrid(ortho);
    const nblettres = orthoUpper.length;

    const key = `${orthoUpper}|${lemme}|${cgram}|${infover}`;
    if (seen.has(key)) continue;
    seen.add(key);

    batch.push([ortho, lemme, cgram, genre, nombre, infover, nblettres, orthoUpper]);
    total++;

    if (batch.length >= 5000) {
      runBatch(batch);
      batch = [];
      if (progressCallback) progressCallback(total);
    }
  }

  if (batch.length > 0) runBatch(batch);
  return total;
}

// ========== EXPORTS ==========

module.exports = {
  EXTERNAL_DICTS,
  DB_DIR,
  getDb,
  closeDb,
  stripAccents,
  normalizeForGrid,
  normalizeForSearch,
  patternToRegex,
  patternToLike,
  backupDb,
  initDb,
  importLexique,
  getEnabledSources,
  setSourceEnabled,
  getDictSettings,
  renameExternalDict,
  getDictGroups,
  addDictGroup,
  updateDictGroup,
  deleteDictGroup,
  searchByPatternGrouped,
  searchByPatternFlat,
  getAllSources,
  getDerivedForms,
  getPersonalDicts,
  addPersonalDict,
  renamePersonalDict,
  deletePersonalDict,
  getPersonalDictName,
  addPersonalWord,
  updatePersonalWord,
  deletePersonalWord,
  getPersonalWords,
  getPersonalWord,
  getCategories,
  deleteExternalSource,
  browseDictionary,
  syncPersonalJson,
  exportPersonalDictionary,
  importPersonalDictionary,
  saveGrid,
  loadGrid,
  listGrids,
  listGridsFull,
  deleteGrid,
  getLexiqueStats,
  getPersonalStats,
  getExternalCount,
  updateDictCount,
  getLocutionsCount,
  searchLocutions,
  randomLocutions,
  getLocutionsCategories,
  getMemos,
  addMemo,
  updateMemo,
  deleteMemo,
  clearExternalSource,
  insertExternalBatch,
  DOWNLOAD_FUNCTIONS,
  downloadSigles,
  downloadCommunes,
  downloadPrenoms,
  downloadToponymes,
  downloadPersonnalites,
  downloadWikipedia,
  downloadLocutions,
};
