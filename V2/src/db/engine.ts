/**
 * sql.js engine — singleton for browser-side SQLite.
 * Loads a .db file into memory via sql.js (WASM).
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

let db: SqlJsDatabase | null = null
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function ensureSqlJs() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
  }
  return SQL
}

/** Load a database from a Uint8Array (e.g. from a file picker) */
export async function loadDatabase(data: Uint8Array): Promise<void> {
  const S = await ensureSqlJs()
  if (db) db.close()
  db = new S.Database(data)
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
}

/** Create a new empty database and run initDb schema */
export async function createEmptyDatabase(): Promise<void> {
  const S = await ensureSqlJs()
  if (db) db.close()
  db = new S.Database()
  db.run('PRAGMA foreign_keys = ON')
}

/** Get the current database instance. Throws if not loaded. */
export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not loaded')
  return db
}

/** Check if a database is currently loaded */
export function isDbReady(): boolean {
  return db !== null
}

/** Export the current database as a Uint8Array (for saving) */
export function exportDatabase(): Uint8Array {
  return getDb().export()
}

/** Close the current database */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ========== Query helpers ==========
// sql.js returns [{columns: string[], values: unknown[][]}]
// We convert to Record<string, unknown>[] like better-sqlite3's .all()

/** Run a SELECT and return rows as objects */
export function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const result = getDb().exec(sql, params as never[])
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj as T
  })
}

/** Run a SELECT and return the first row or null */
export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/** Run a non-SELECT statement (INSERT, UPDATE, DELETE, CREATE, etc.) */
export function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never[])
}

/** Run multiple statements (for schema creation) */
export function exec(sql: string): void {
  getDb().exec(sql)
}

/** Get the last inserted row id */
export function lastInsertRowId(): number {
  const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id')
  return row?.id ?? 0
}
