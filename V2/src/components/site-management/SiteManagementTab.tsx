import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Globe,
  HardDrive,
  ArrowRight,
  ArrowLeft,
  Upload,
  Undo2,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { siteApi } from '@/api/client'

interface SiteGrid {
  nom: string
  nom_online: string
  rows: number
  cols: number
  auteur: string
}

interface SiteState {
  online: SiteGrid[]
  offline: SiteGrid[]
}

export function SiteManagementTab() {
  const [current, setCurrent] = useState<SiteState>({ online: [], offline: [] })
  const [original, setOriginal] = useState<SiteState>({ online: [], offline: [] })
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await siteApi.grilles()
      const state: SiteState = {
        online: res.online as SiteGrid[],
        offline: res.offline as SiteGrid[],
      }
      setCurrent(state)
      setOriginal(structuredClone(state))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const hasChanges = useCallback((): boolean => {
    const onlineNames = current.online.map((g) => g.nom).sort().join(',')
    const origNames = original.online.map((g) => g.nom).sort().join(',')
    return onlineNames !== origNames
  }, [current, original])

  const moveToOnline = (grid: SiteGrid) => {
    setCurrent((prev) => ({
      online: [...prev.online, grid],
      offline: prev.offline.filter((g) => g.nom !== grid.nom),
    }))
    setSuccess(false)
  }

  const moveToOffline = (grid: SiteGrid) => {
    setCurrent((prev) => ({
      online: prev.online.filter((g) => g.nom !== grid.nom),
      offline: [...prev.offline, grid],
    }))
    setSuccess(false)
  }

  const handleUndo = () => {
    setCurrent(structuredClone(original))
    setSuccess(false)
  }

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    setSuccess(false)
    try {
      await siteApi.apply(current.online)
      setOriginal(structuredClone(current))
      setSuccess(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gestion du site joueur</h2>
        <div className="flex items-center gap-2">
          {success && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Publié
            </div>
          )}
          {error && (
            <span className="text-sm text-destructive">{error}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={!hasChanges()}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!hasChanges() || applying}
          >
            {applying ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            Publier
          </Button>
        </div>
      </div>

      {/* Two columns */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Online column */}
        <div className="flex flex-1 flex-col rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <Globe className="h-4 w-4 text-green-600" />
            <span className="font-medium">En ligne</span>
            <Badge variant="secondary" className="ml-auto">
              {current.online.length}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {current.online.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Aucune grille en ligne
                </div>
              ) : (
                current.online.map((grid) => (
                  <GridRow
                    key={grid.nom}
                    grid={grid}
                    action="offline"
                    onSwap={() => moveToOffline(grid)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Offline column */}
        <div className="flex flex-1 flex-col rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Hors ligne</span>
            <Badge variant="secondary" className="ml-auto">
              {current.offline.length}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {current.offline.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Aucune grille hors ligne
                </div>
              ) : (
                current.offline.map((grid) => (
                  <GridRow
                    key={grid.nom}
                    grid={grid}
                    action="online"
                    onSwap={() => moveToOnline(grid)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

// ========== GRID ROW ==========

function GridRow({
  grid,
  action,
  onSwap,
}: {
  grid: SiteGrid
  action: 'online' | 'offline'
  onSwap: () => void
}) {
  return (
    <div className="group flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{grid.nom}</span>
          {grid.nom_online && grid.nom_online !== grid.nom && (
            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
              {grid.nom_online}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{grid.rows}×{grid.cols}</span>
          {grid.auteur && (
            <>
              <span>·</span>
              <span className="truncate">{grid.auteur}</span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onSwap}
        title={action === 'online' ? 'Mettre en ligne' : 'Mettre hors ligne'}
      >
        {action === 'online' ? (
          <ArrowLeft className="h-4 w-4" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
