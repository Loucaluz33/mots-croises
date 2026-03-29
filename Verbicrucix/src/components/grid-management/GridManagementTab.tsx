import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { LayoutList, LayoutGrid, FolderOpen, Pencil, Trash2, RefreshCw, ExternalLink } from 'lucide-react'
import { listGridsFull, deleteGridById, updateGridMeta } from '@/db/queries'
import type { GridMeta } from '@/db/queries'
import { useNavigation } from '@/contexts/NavigationContext'
import { useDatabase } from '@/contexts/DatabaseContext'

interface GridEntry {
  id: number
  nom: string
  auteur: string
  difficulte: string
  themes: string
  nom_online: string
  rows: number
  cols: number
  terminee: boolean
  date_creation: string
  date_modif: string
  grid?: Array<Array<{ black: boolean; letter: string }>>
}

type ViewMode = 'list' | 'thumbnails'

export function GridManagementTab() {
  const nav = useNavigation()
  const { markDirty } = useDatabase()
  const [grids, setGrids] = useState<GridEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [error, setError] = useState<string | null>(null)

  // Edit dialog
  const [editGrid, setEditGrid] = useState<GridEntry | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editAuteur, setEditAuteur] = useState('')
  const [editDifficulte, setEditDifficulte] = useState('')
  const [editThemes, setEditThemes] = useState('')
  const [editNomOnline, setEditNomOnline] = useState('')

  const loadGrids = useCallback(() => {
    setLoading(true)
    setError(null)
    try {
      const raw = listGridsFull()
      const entries: GridEntry[] = raw.map(g => {
        let parsed: Record<string, unknown> = {}
        try { parsed = typeof g.json_data === 'string' ? JSON.parse(g.json_data) : g.json_data as Record<string, unknown> } catch { /* ignore */ }
        const size = parsed.size as { rows: number; cols: number } | undefined
        return {
          id: g.id,
          nom: g.nom,
          auteur: g.auteur || (parsed.author as string) || '',
          difficulte: g.difficulte || '',
          themes: g.themes || '',
          nom_online: g.nom_online || '',
          rows: size?.rows ?? 0,
          cols: size?.cols ?? 0,
          terminee: !!g.terminee,
          date_creation: g.date_creation,
          date_modif: g.date_modif,
          grid: parsed.grid as GridEntry['grid'],
        }
      })
      setGrids(entries)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGrids()
  }, [loadGrids])

  const handleOpen = useCallback((grid: GridEntry) => {
    nav.openGridInEditor(grid.id)
  }, [nav])

  const handleDelete = useCallback((grid: GridEntry) => {
    if (!confirm(`Supprimer la grille "${grid.nom}" ?`)) return
    try {
      deleteGridById(grid.id)
      setGrids(prev => prev.filter(g => g.id !== grid.id))
      markDirty()
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [markDirty])

  const handleEditOpen = useCallback((grid: GridEntry) => {
    setEditGrid(grid)
    setEditNom(grid.nom)
    setEditAuteur(grid.auteur)
    setEditDifficulte(grid.difficulte)
    setEditThemes(grid.themes)
    setEditNomOnline(grid.nom_online)
  }, [])

  const handleEditConfirm = useCallback(() => {
    if (!editGrid || !editNom.trim()) return
    try {
      const meta: GridMeta = {
        nom: editNom.trim(),
        auteur: editAuteur.trim(),
        difficulte: editDifficulte.trim(),
        themes: editThemes.split(',').map(t => t.trim()).filter(Boolean).join(', '),
        nom_online: editNomOnline.trim(),
      }
      updateGridMeta(editGrid.id, meta)
      setGrids(prev => prev.map(g =>
        g.id === editGrid.id ? { ...g, nom: meta.nom, auteur: meta.auteur, difficulte: meta.difficulte, themes: meta.themes, nom_online: meta.nom_online } : g
      ))
      setEditGrid(null)
      markDirty()
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [editGrid, editNom, editAuteur, editDifficulte, editThemes, editNomOnline, markDirty])

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
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Mes grilles</h2>
          <Badge variant="secondary">{grids.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadGrids}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Actualiser
          </Button>
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
      </div>

      {loading ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          Chargement...
        </div>
      ) : grids.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FolderOpen className="mx-auto mb-2 h-10 w-10 opacity-20" />
            <p>Aucune grille sauvegardée</p>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <ListView grids={grids} formatDate={formatDate} onOpen={handleOpen} onEdit={handleEditOpen} onDelete={handleDelete} />
      ) : (
        <ThumbnailView grids={grids} formatDate={formatDate} onOpen={handleOpen} onEdit={handleEditOpen} onDelete={handleDelete} />
      )}

      {/* Edit metadata dialog */}
      <Dialog open={!!editGrid} onOpenChange={open => { if (!open) setEditGrid(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la grille</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                value={editNom}
                onChange={e => setEditNom(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Auteur</Label>
              <Input
                value={editAuteur}
                onChange={e => setEditAuteur(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Difficulté</Label>
              <Input
                value={editDifficulte}
                onChange={e => setEditDifficulte(e.target.value)}
                placeholder="Facile, Moyen, Difficile..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Thèmes</Label>
              <Input
                value={editThemes}
                onChange={e => setEditThemes(e.target.value)}
                placeholder="Culture, Sport, Cinéma... (séparés par des virgules)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nom online</Label>
              <Input
                value={editNomOnline}
                onChange={e => setEditNomOnline(e.target.value)}
                placeholder="Identifiant pour le site joueur"
                onKeyDown={e => { if (e.key === 'Enter') handleEditConfirm() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGrid(null)}>Annuler</Button>
            <Button onClick={handleEditConfirm} disabled={!editNom.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========== LIST VIEW ==========

function ListView({
  grids,
  formatDate,
  onOpen,
  onEdit,
  onDelete,
}: {
  grids: GridEntry[]
  formatDate: (d: string) => string
  onOpen: (g: GridEntry) => void
  onEdit: (g: GridEntry) => void
  onDelete: (g: GridEntry) => void
}) {
  return (
    <ScrollArea className="flex-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Nom</th>
            <th className="px-3 py-2">Auteur</th>
            <th className="px-3 py-2">Taille</th>
            <th className="px-3 py-2">Difficulté</th>
            <th className="px-3 py-2">Thèmes</th>
            <th className="px-3 py-2">Modification</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {grids.map(g => (
            <tr
              key={g.id}
              className="group cursor-pointer border-b transition-colors hover:bg-muted/50"
              onDoubleClick={() => onOpen(g)}
            >
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  {g.nom}
                  {g.terminee && (
                    <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                      Terminée
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{g.auteur || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">{g.rows}x{g.cols}</td>
              <td className="px-3 py-2 text-muted-foreground">{g.difficulte || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {g.themes ? (
                  <div className="flex flex-wrap gap-1">
                    {g.themes.split(',').map((t, i) => (
                      <Badge key={i} variant="outline" className="px-1.5 py-0 text-[10px]">
                        {t.trim()}
                      </Badge>
                    ))}
                  </div>
                ) : '—'}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(g.date_modif)}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpen(g)} title="Ouvrir dans l'éditeur">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(g)} title="Modifier les métadonnées">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(g)} title="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
  onOpen,
  onEdit,
  onDelete,
}: {
  grids: GridEntry[]
  formatDate: (d: string) => string
  onOpen: (g: GridEntry) => void
  onEdit: (g: GridEntry) => void
  onDelete: (g: GridEntry) => void
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {grids.map(g => (
          <GridCard key={g.id} grid={g} formatDate={formatDate} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </ScrollArea>
  )
}

// ========== GRID CARD ==========

function GridCard({
  grid,
  formatDate,
  onOpen,
  onEdit,
  onDelete,
}: {
  grid: GridEntry
  formatDate: (d: string) => string
  onOpen: (g: GridEntry) => void
  onEdit: (g: GridEntry) => void
  onDelete: (g: GridEntry) => void
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

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid.grid[r]?.[c]
        const x = c * cellSize
        const y = r * cellSize

        if (cell?.black) {
          ctx.fillStyle = '#1a1a2e'
          ctx.fillRect(x, y, cellSize, cellSize)
        } else if (cell?.letter) {
          ctx.fillStyle = '#333333'
          ctx.font = `bold ${Math.max(cellSize - 4, 8)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(cell.letter.toUpperCase(), x + cellSize / 2, y + cellSize / 2 + 1)
        }
      }
    }

    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(width, r * cellSize); ctx.stroke()
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, height); ctx.stroke()
    }

    ctx.strokeStyle = '#6b7280'
    ctx.lineWidth = 1.5
    ctx.strokeRect(0, 0, width, height)
  }, [grid])

  return (
    <div
      className="group cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 hover:shadow-sm"
      onDoubleClick={() => onOpen(grid)}
    >
      {/* Canvas preview */}
      <div className="mb-3 flex items-center justify-center rounded bg-muted/30 p-2">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>

      {/* Info */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{grid.nom}</span>
          {grid.terminee && (
            <Badge variant="default" className="shrink-0 px-1.5 py-0 text-[10px]">
              Terminée
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{grid.rows}x{grid.cols}</span>
          {grid.auteur && (
            <>
              <span>·</span>
              <span className="truncate">{grid.auteur}</span>
            </>
          )}
        </div>
        {grid.themes && (
          <div className="flex flex-wrap gap-1">
            {grid.themes.split(',').map((t, i) => (
              <Badge key={i} variant="outline" className="px-1.5 py-0 text-[10px]">
                {t.trim()}
              </Badge>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {formatDate(grid.date_modif)}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpen(grid)}>
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Ouvrir
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onEdit(grid)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Modifier
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => onDelete(grid)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  )
}
