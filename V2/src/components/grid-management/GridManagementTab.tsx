import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LayoutList, LayoutGrid, Loader2, FolderOpen } from 'lucide-react'
import { gridManagementApi } from '@/api/client'
import type { GridMetadata } from '@/types/grid'

interface GridEntry {
  nom: string
  rows: number
  cols: number
  terminee: boolean
  date_creation: string
  date_modif: string
  metadata?: GridMetadata
  grid?: Array<Array<{ black: boolean; letter: string }>>
}

type ViewMode = 'list' | 'thumbnails'

export function GridManagementTab() {
  const [grids, setGrids] = useState<GridEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [error, setError] = useState<string | null>(null)

  const loadGrids = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gridManagementApi.list()
      setGrids(res.grids as GridEntry[])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGrids()
  }, [loadGrids])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-destructive">
        <p>Erreur : {error}</p>
        <Button variant="outline" size="sm" onClick={loadGrids}>
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Mes grilles</h2>
          <Badge variant="secondary">{grids.length}</Badge>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('list')}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'thumbnails' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('thumbnails')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {grids.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FolderOpen className="mx-auto mb-2 h-10 w-10 opacity-20" />
            <p>Aucune grille sauvegardée</p>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <ListView grids={grids} formatDate={formatDate} />
      ) : (
        <ThumbnailView grids={grids} formatDate={formatDate} />
      )}
    </div>
  )
}

// ========== LIST VIEW ==========

function ListView({
  grids,
  formatDate,
}: {
  grids: GridEntry[]
  formatDate: (d: string) => string
}) {
  return (
    <ScrollArea className="flex-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Nom</th>
            <th className="px-3 py-2">Taille</th>
            <th className="px-3 py-2">Auteur</th>
            <th className="px-3 py-2">Création</th>
            <th className="px-3 py-2">Modification</th>
            <th className="px-3 py-2">Difficulté</th>
            <th className="px-3 py-2">Thème</th>
          </tr>
        </thead>
        <tbody>
          {grids.map((g) => (
            <tr
              key={g.nom}
              className="border-b cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  {g.nom}
                  {g.terminee && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      Terminée
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {g.rows}×{g.cols}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {g.metadata?.author || '—'}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(g.date_creation)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(g.date_modif)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {g.metadata?.difficulty || '—'}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {g.metadata?.theme || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}

// ========== THUMBNAIL VIEW ==========

function ThumbnailView({
  grids,
  formatDate,
}: {
  grids: GridEntry[]
  formatDate: (d: string) => string
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {grids.map((g) => (
          <GridCard key={g.nom} grid={g} formatDate={formatDate} />
        ))}
      </div>
    </ScrollArea>
  )
}

// ========== GRID CARD ==========

function GridCard({
  grid,
  formatDate,
}: {
  grid: GridEntry
  formatDate: (d: string) => string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grid.grid) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rows = grid.rows || grid.grid.length
    const cols = grid.cols || (grid.grid[0]?.length ?? 0)
    if (rows === 0 || cols === 0) return

    const size = 180
    const cellSize = Math.min(Math.floor(size / Math.max(rows, cols)), 20)
    const width = cols * cellSize
    const height = rows * cellSize

    canvas.width = width
    canvas.height = height

    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid.grid[r]?.[c]
        const x = c * cellSize
        const y = r * cellSize

        if (cell?.black) {
          ctx.fillStyle = '#1a1a2e'
          ctx.fillRect(x, y, cellSize, cellSize)
        } else {
          // White cell
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(x, y, cellSize, cellSize)

          // Letter
          if (cell?.letter) {
            ctx.fillStyle = '#333333'
            ctx.font = `bold ${Math.max(cellSize - 4, 8)}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(cell.letter.toUpperCase(), x + cellSize / 2, y + cellSize / 2 + 1)
          }
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath()
      ctx.moveTo(0, r * cellSize)
      ctx.lineTo(width, r * cellSize)
      ctx.stroke()
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath()
      ctx.moveTo(c * cellSize, 0)
      ctx.lineTo(c * cellSize, height)
      ctx.stroke()
    }

    // Outer border
    ctx.strokeStyle = '#6b7280'
    ctx.lineWidth = 1.5
    ctx.strokeRect(0, 0, width, height)
  }, [grid])

  return (
    <div className="group cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 hover:shadow-sm">
      {/* Canvas preview */}
      <div className="mb-3 flex items-center justify-center rounded bg-muted/30 p-2">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>

      {/* Info */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{grid.nom}</span>
          {grid.terminee && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">
              Terminée
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{grid.rows}×{grid.cols}</span>
          {grid.metadata?.author && (
            <>
              <span>·</span>
              <span className="truncate">{grid.metadata.author}</span>
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(grid.date_modif)}
        </div>
      </div>
    </div>
  )
}
