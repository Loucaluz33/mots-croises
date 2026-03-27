import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { memosApi, dictionariesApi } from '@/api/client'
import { Plus, Pencil, Trash2, Search, MessageSquare } from 'lucide-react'

// ========== TYPES ==========

interface Memo {
  id: number
  mot: string
  dictionnaire_cible: string
  categorie: string
  note: string
  date_modif: string
}

interface Dictionary {
  id: number
  name: string
}

interface MemoFormData {
  mot: string
  dictionnaire_cible: string
  categorie: string
  note: string
}

const emptyForm: MemoFormData = { mot: '', dictionnaire_cible: '', categorie: '', note: '' }

// ========== COMPONENT ==========

export function MemoTab() {
  const [memos, setMemos] = useState<Memo[]>([])
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'add' | 'edit'>('add')
  const [editForm, setEditForm] = useState<MemoFormData>(emptyForm)
  const [editMemoId, setEditMemoId] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteMemo, setDeleteMemo] = useState<Memo | null>(null)

  // --- Load dictionaries (for dropdown) ---
  useEffect(() => {
    dictionariesApi.list().then((res) => {
      setDictionaries((res.dictionaries ?? []) as Dictionary[])
    }).catch(() => {})
  }, [])

  // --- Debounce search ---
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // --- Load memos ---
  const loadMemos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await memosApi.list(debouncedSearch || undefined)
      setMemos(res.memos as Memo[])
    } catch (e) {
      console.error('Failed to load memos:', e)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => {
    loadMemos()
  }, [loadMemos])

  // --- Dialog helpers ---
  const openAddDialog = useCallback(() => {
    setEditMode('add')
    setEditForm(emptyForm)
    setEditMemoId(null)
    setEditOpen(true)
  }, [])

  const openEditDialog = useCallback((m: Memo) => {
    setEditMode('edit')
    setEditForm({
      mot: m.mot,
      dictionnaire_cible: m.dictionnaire_cible || '',
      categorie: m.categorie || '',
      note: m.note || '',
    })
    setEditMemoId(m.id)
    setEditOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!editForm.mot.trim()) return
    const payload = {
      mot: editForm.mot.toUpperCase().replace(/[^A-Z]/g, ''),
      dictionnaire_cible: editForm.dictionnaire_cible,
      categorie: editForm.categorie,
      note: editForm.note,
    }
    try {
      if (editMode === 'add') {
        await memosApi.create(payload)
      } else if (editMemoId !== null) {
        await memosApi.update(editMemoId, payload)
      }
      setEditOpen(false)
      loadMemos()
    } catch (e) {
      console.error('Save memo failed:', e)
    }
  }, [editForm, editMode, editMemoId, loadMemos])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteMemo) return
    try {
      await memosApi.delete(deleteMemo.id)
      setDeleteOpen(false)
      setDeleteMemo(null)
      loadMemos()
    } catch (e) {
      console.error('Delete memo failed:', e)
    }
  }, [deleteMemo, loadMemos])

  // ========== RENDER ==========

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Memos</h2>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un memo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4" data-icon="inline-start" />
          Ajouter
        </Button>
      </div>

      {/* Count */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {memos.length} memo{memos.length !== 1 ? 's' : ''}
        </Badge>
        {loading && (
          <span className="text-xs text-muted-foreground animate-pulse">Chargement...</span>
        )}
      </div>

      {/* Table */}
      <ScrollArea className="flex-1 rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Mot</th>
              <th className="px-3 py-2 text-left font-medium">Dictionnaire cible</th>
              <th className="px-3 py-2 text-left font-medium">Categorie</th>
              <th className="px-3 py-2 text-left font-medium">Note</th>
              <th className="px-3 py-2 text-left font-medium w-28">Date modif</th>
              <th className="px-3 py-2 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {memos.map((m) => (
              <tr
                key={m.id}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <td className="px-3 py-2 font-mono font-semibold tracking-wider">{m.mot}</td>
                <td className="px-3 py-2 text-muted-foreground">{m.dictionnaire_cible || '—'}</td>
                <td className="px-3 py-2">
                  {m.categorie ? (
                    <Badge variant="outline" className="text-xs">
                      {m.categorie}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 max-w-[250px] truncate text-muted-foreground">
                  {m.note || '—'}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {m.date_modif ? new Date(m.date_modif).toLocaleDateString('fr-FR') : ''}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEditDialog(m)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        setDeleteMemo(m)
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {memos.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  Aucun memo. Cliquez sur &laquo; Ajouter &raquo; pour en creer un.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>

      {/* ========== Add/Edit Dialog ========== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editMode === 'add' ? 'Ajouter un memo' : 'Modifier le memo'}
            </DialogTitle>
            <DialogDescription>
              {editMode === 'add'
                ? 'Notez un mot a ajouter plus tard dans un dictionnaire.'
                : `Modification du memo pour ${editForm.mot}`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="memo-mot">Mot</Label>
              <Input
                id="memo-mot"
                value={editForm.mot}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    mot: e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
                  }))
                }
                placeholder="EXEMPLE"
                className="font-mono tracking-wider"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Dictionnaire cible</Label>
              <Select
                value={editForm.dictionnaire_cible || undefined}
                onValueChange={(val) =>
                  setEditForm((f) => ({ ...f, dictionnaire_cible: String(val) }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un dictionnaire..." />
                </SelectTrigger>
                <SelectContent>
                  {dictionaries.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="memo-cat">Categorie</Label>
              <Input
                id="memo-cat"
                value={editForm.categorie}
                onChange={(e) => setEditForm((f) => ({ ...f, categorie: e.target.value }))}
                placeholder="Ex: nom propre, lieu..."
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="memo-note">Note</Label>
              <textarea
                id="memo-note"
                value={editForm.note}
                onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                placeholder="Pourquoi garder ce mot..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={!editForm.mot}>
              {editMode === 'add' ? 'Ajouter' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Delete Confirmation ========== */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le memo</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment supprimer le memo pour{' '}
              <span className="font-mono font-semibold">{deleteMemo?.mot}</span> ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
