import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface NavigationContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
  /** ID of the grid to open in the editor (set by GridManagement, consumed by GridEditor) */
  pendingGridId: number | null
  openGridInEditor: (id: number) => void
  clearPendingGrid: () => number | null
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState('editor')
  const [pendingGridId, setPendingGridId] = useState<number | null>(null)

  const openGridInEditor = useCallback((id: number) => {
    setPendingGridId(id)
    setActiveTab('editor')
  }, [])

  const clearPendingGrid = useCallback(() => {
    const id = pendingGridId
    setPendingGridId(null)
    return id
  }, [pendingGridId])

  return (
    <NavigationContext.Provider value={{ activeTab, setActiveTab, pendingGridId, openGridInEditor, clearPendingGrid }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
