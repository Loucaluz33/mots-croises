import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { loadDatabase, createEmptyDatabase, exportDatabase, isDbReady } from '@/db/engine'
import { initDb } from '@/db/queries'

interface DatabaseContextValue {
  isLoaded: boolean
  isLoading: boolean
  error: string | null
  loadFromFile: (file: File) => Promise<void>
  createNew: () => Promise<void>
  saveToFile: () => void
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null)

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFromFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      await loadDatabase(new Uint8Array(buffer))
      // Run schema migrations (creates missing tables if needed)
      initDb()
      setIsLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createNew = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await createEmptyDatabase()
      initDb()
      setIsLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de création')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const saveToFile = useCallback(() => {
    if (!isDbReady()) return
    const data = exportDatabase()
    const blob = new Blob([data], { type: 'application/x-sqlite3' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'verbicruciste.db'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <DatabaseContext.Provider value={{ isLoaded, isLoading, error, loadFromFile, createNew, saveToFile }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider')
  return ctx
}
