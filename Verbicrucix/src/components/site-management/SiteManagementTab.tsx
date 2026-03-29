import { useState, useEffect, useCallback } from 'react'
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
import {
  Globe,
  HardDrive,
  ArrowRight,
  ArrowLeft,
  Upload,
  Undo2,
  Loader2,
  CheckCircle2,
  Settings,
  Pencil,
  Plus,
} from 'lucide-react'
import {
  type GitHubConfig,
  type SiteGrid,
  getGitHubConfig,
  saveGitHubConfig,
  getSiteGrids,
  applySiteChanges,
  updateOnlineName,
  uploadGrid,
} from '@/lib/github'
import { listGridsFull, loadGrid } from '@/db/queries'

// ========== TYPES ==========

interface SiteState {
  online: SiteGrid[]
  offline: SiteGrid[]
  indexSha: string
}

// ========== COMPONENT ==========

export function SiteManagementTab() {
  const [config, setConfig] = useState<GitHubConfig | null>(getGitHubConfig)
  const [configOpen, setConfigOpen] = useState(false)
  const [current, setCurrent] = useState<SiteState>({ online: [], offline: [], indexSha: '' })
  const [original, setOriginal] = useState<SiteState>({ online: [], offline: [], indexSha: '' })
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Rename dialog
  const [renameGrid, setRenameGrid] = useState<SiteGrid | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Upload from DB dialog
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dbGrids, setDbGrids] = useState<{ nom: string }[]>([])
  const [uploading, setUploading] = useState<string | null>(null)

  // ========== LOAD DATA ==========

  const loadData = useCallback(async () => {
    if (!config) return
    setLoading(true)
    setError(null)
    try {
      const data = await getSiteGrids(config)
      setCurrent(data)
      setOriginal(structuredClone(data))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    if (config) loadData()
  }, [config, loadData])

  // ========== CHANGE DETECTION ==========

  const hasChanges = useCallback((): boolean => {
    if (current.online.length !== original.online.length) return true
    return current.online.some((g, i) => g.file !== original.online[i]?.file)
  }, [current, original])

  // ========== MOVE GRIDS ==========

  const moveToOnline = (grid: SiteGrid) => {
    setCurrent(prev => ({
      ...prev,
      online: [...prev.online, grid],
      offline: prev.offline.filter(g => g.file !== grid.file),
    }))
    setSuccess(false)
  }

  const moveToOffline = (grid: SiteGrid) => {
    setCurrent(prev => ({
      ...prev,
      online: prev.online.filter(g => g.file !== grid.file),
      offline: [...prev.offline, grid],
    }))
    setSuccess(false)
  }

  const handleUndo = () => {
    setCurrent(structuredClone(original))
    setSuccess(false)
  }

  // ========== APPLY (COMMIT + PUSH) ==========

  const handleApply = async () => {
    if (!config) return
    setApplying(true)
    setError(null)
    setSuccess(false)
    try {
      await applySiteChanges(config, current.online.map(g => g.file))
      setOriginal(structuredClone(current))
      setSuccess(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  // ========== RENAME ==========

  const handleRenameOpen = (grid: SiteGrid) => {
    setRenameGrid(grid)
    setRenameValue(grid.onlineName)
  }

  const handleRenameConfirm = async () => {
    if (!config || !renameGrid || !renameValue.trim()) return
    setError(null)
    try {
      await updateOnlineName(config, renameGrid.file, renameValue.trim())
      // Update local state
      const update = (grid: SiteGrid) =>
        grid.file === renameGrid.file ? { ...grid, onlineName: renameValue.trim() } : grid
      setCurrent(prev => ({
        ...prev,
        online: prev.online.map(update),
        offline: prev.offline.map(update),
      }))
      setOriginal(prev => ({
        ...prev,
        online: prev.online.map(update),
        offline: prev.offline.map(update),
      }))
      setRenameGrid(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ========== UPLOAD FROM DB ==========

  const handleUploadOpen = () => {
    try {
      const grids = listGridsFull()
      setDbGrids(grids as { nom: string }[])
      setUploadOpen(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleUploadGrid = async (gridName: string) => {
    if (!config) return
    setUploading(gridName)
    setError(null)
    try {
      const result = loadGrid(gridName)
      if (!result) throw new Error('Grille introuvable')
      const gridJson = typeof result.grid === 'string' ? result.grid : JSON.stringify(result.grid)
      const fileName = gridName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json'
      await uploadGrid(config, fileName, gridJson)
      setUploadOpen(false)
      // Reload to see the new grid
      await loadData()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(null)
    }
  }

  // ========== CONFIG SCREEN ==========

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Globe className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Connexion GitHub</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configurez votre repo GitHub Pages pour gérer le site joueur.
            </p>
          </div>
          <GitHubConfigForm
            onSave={(c) => { saveGitHubConfig(c); setConfig(c) }}
          />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Chargement depuis GitHub...</span>
      </div>
    )
  }

  // ========== MAIN UI ==========

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Gestion du site joueur</h2>
          <Badge variant="outline" className="text-xs">
            {config.owner}/{config.repo}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {success && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Publié
            </div>
          )}
          {error && (
            <span className="max-w-[300px] truncate text-sm text-destructive" title={error}>
              {error}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleUploadOpen}>
            <Plus className="mr-1.5 h-4 w-4" />
            Ajouter depuis la DB
          </Button>
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={!hasChanges()}>
            <Undo2 className="mr-1.5 h-4 w-4" />
            Annuler
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!hasChanges() || applying}>
            {applying ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            Publier
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfigOpen(true)} title="Paramètres GitHub">
            <Settings className="h-4 w-4" />
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
                current.online.map(grid => (
                  <GridRow
                    key={grid.file}
                    grid={grid}
                    action="offline"
                    onSwap={() => moveToOffline(grid)}
                    onRename={() => handleRenameOpen(grid)}
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
            <span className="font-medium">Sur GitHub (hors ligne)</span>
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
                current.offline.map(grid => (
                  <GridRow
                    key={grid.file}
                    grid={grid}
                    action="online"
                    onSwap={() => moveToOnline(grid)}
                    onRename={() => handleRenameOpen(grid)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameGrid} onOpenChange={(open) => { if (!open) setRenameGrid(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer la grille</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              Fichier : <span className="font-mono">{renameGrid?.file}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Nom affiché sur le site</Label>
              <Input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm() }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameGrid(null)}>Annuler</Button>
            <Button onClick={handleRenameConfirm} disabled={!renameValue.trim()}>
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload from DB dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une grille depuis la base</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 py-2">
              {dbGrids.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Aucune grille sauvegardée dans la base.
                </p>
              ) : (
                dbGrids.map(g => (
                  <div
                    key={g.nom}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="text-sm">{g.nom}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUploadGrid(g.nom)}
                      disabled={uploading === g.nom}
                    >
                      {uploading === g.nom ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-4 w-4" />
                      )}
                      Envoyer
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Config dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paramètres GitHub</DialogTitle>
          </DialogHeader>
          <GitHubConfigForm
            initial={config}
            onSave={(c) => {
              saveGitHubConfig(c)
              setConfig(c)
              setConfigOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========== GRID ROW ==========

function GridRow({
  grid,
  action,
  onSwap,
  onRename,
}: {
  grid: SiteGrid
  action: 'online' | 'offline'
  onSwap: () => void
  onRename: () => void
}) {
  return (
    <div className="group flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{grid.onlineName}</span>
          {grid.onlineName !== grid.title && (
            <Badge variant="outline" className="shrink-0 px-1.5 text-[10px]">
              {grid.file}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {grid.size && <span>{grid.size.rows}x{grid.size.cols}</span>}
          {grid.author && (
            <>
              <span>·</span>
              <span className="truncate">{grid.author}</span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onRename}
        title="Renommer"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
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

// ========== GITHUB CONFIG FORM ==========

function GitHubConfigForm({
  initial,
  onSave,
}: {
  initial?: GitHubConfig | null
  onSave: (config: GitHubConfig) => void
}) {
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [repo, setRepo] = useState(initial?.repo ?? '')
  const [token, setToken] = useState(initial?.token ?? '')

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Propriétaire GitHub</Label>
        <Input
          placeholder="votre-pseudo"
          value={owner}
          onChange={e => setOwner(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Nom du repo</Label>
        <Input
          placeholder="mots-croises"
          value={repo}
          onChange={e => setRepo(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Token d'accès personnel</Label>
        <Input
          type="password"
          placeholder="ghp_..."
          value={token}
          onChange={e => setToken(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Créez un token sur GitHub &gt; Settings &gt; Developer settings &gt; Personal access tokens.
          Il doit avoir la permission <span className="font-mono">repo</span>.
        </p>
      </div>
      <Button
        className="w-full"
        onClick={() => onSave({ owner: owner.trim(), repo: repo.trim(), token: token.trim() })}
        disabled={!owner.trim() || !repo.trim() || !token.trim()}
      >
        Connecter
      </Button>
    </div>
  )
}
