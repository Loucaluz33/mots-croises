import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { loadDatabase, exportDatabase, isDbReady } from '@/db/engine'
import { initDb } from '@/db/queries'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'error'

interface DatabaseContextValue {
  isLoaded: boolean
  isLoading: boolean
  error: string | null
  saveStatus: SaveStatus
  saveError: string | null
  save: () => Promise<void>
  markDirty: () => void
  reloadDb: () => Promise<void>
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null)

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const isSavingRef = useRef(false)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-load the database from the dev server on startup
  useEffect(() => {
    let cancelled = false
    async function autoLoad() {
      try {
        const res = await fetch('/api/db')
        if (!res.ok) {
          throw new Error(`Impossible de charger la base de données (${res.status})`)
        }
        const buffer = await res.arrayBuffer()
        await loadDatabase(new Uint8Array(buffer))
        initDb()
        if (!cancelled) setIsLoaded(true)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    autoLoad()
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async () => {
    if (!isDbReady()) return
    if (isSavingRef.current) return
    isSavingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const data = exportDatabase()
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveStatus('idle')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      setSaveError(msg)
      setSaveStatus('error')
    } finally {
      isSavingRef.current = false
    }
  }, [])

  const reloadDb = useCallback(async () => {
    const res = await fetch('/api/db')
    if (!res.ok) throw new Error(`Reload échoué (${res.status})`)
    const buffer = await res.arrayBuffer()
    await loadDatabase(new Uint8Array(buffer))
    initDb()
    setSaveStatus('idle')
  }, [])

  const markDirty = useCallback(() => {
    setSaveStatus('dirty')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      save().catch(console.error)
    }, 1500)
  }, [save])

  return (
    <DatabaseContext.Provider value={{ isLoaded, isLoading, error, saveStatus, saveError, save, markDirty, reloadDb }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider')
  return ctx
}
