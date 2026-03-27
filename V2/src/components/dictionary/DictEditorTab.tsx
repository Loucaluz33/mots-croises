import { useState, useEffect, useCallback, useRef } from 'react'
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
import { dictionariesApi } from '@/api/client'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

// ========== TYPES ==========

interface Dictionary {
  id: number
  name: string
}

interface DictWord {
  id: number
  mot: string
  longueur: number
  definitions: string
  categorie: string
  notes: string
  date_modif: string
}

interface WordFormData {
  mot: string
  definitions: string
  categorie: string
  notes: string
}

const emptyForm: WordFormData = { mot: '', definitions: '', categorie: '', notes: '' }

// ========== COMPONENT ==========

export function DictEditorTab() {
  // --- State ---
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([])
  const [selectedDictId, setSelectedDictId] = useState<number | null>(null)
  const [words, setWords] = useState<DictWord[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [loading, setLoading] = useState(false)

  // Dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'add' | 'edit'>('add')
  const [editForm, setEditForm] = useState<WordFormData>(emptyForm)
  const [editWordId, setEditWordId] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteWord, setDeleteWord] = useState<DictWord | null>(null)

  const tableRef = useRef<HTMLDivElement>(null)

  // --- Load dictionaries ---
  useEffect(() => {
    dictionariesApi.list().then((res) => {
      const dicts = (res.dictionaries ?? []) as Dictionary[]
      setDictionaries(dicts)
      if (dicts.length > 0 && !selectedDictId) {
        setSelectedDictId(dicts[0].id)
      }
    }).catch(() => {})
  }, [])

  // --- Debounce search ---
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // --- Load words ---
  const loadWords = useCallback(async () => {
    if (!selectedDictId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await dictionariesApi.getWords(selectedDictId, params.toString())
      setWords(res.words as DictWord[])
      setSelectedIndex(-1)
    } catch (e) {
      console.error('Failed to load words:', e)
    } finally {
      setLoading(false)
    }
  }, [selectedDictId, debouncedSearch])

  useEffect(() => {
    loadWords()
  }, [loadWords])

  // --- Keyboard navigation ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editOpen || deleteOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, words.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Delete' && selectedIndex >= 0) {
      e.preventDefault()
      const w = words[selectedIndex]
      if (w) {
        setDeleteWord(w)
        setDeleteOpen(true)
      }
    } else if (e.key === ' ' && selectedIndex >= 0) {
      e.preventDefault()
      const w = words[selectedIndex]
      if (w) openEditDialog(w)
    }
  }, [editOpen, deleteOpen, selectedIndex, words])

  // --- Dialog helpers ---
  const openAddDialog = useCallback(() => {
    setEditMode('add')
    setEditForm(emptyForm)
    setEditWordId(null)
    setEditOpen(true)
  }, [])

  const openEditDialog = useCallback((w: DictWord) => {
    setEditMode('edit')
    setEditForm({
      mot: w.mot,
      definitions: w.definitions || '',
      categorie: w.categorie || '',
      notes: w.notes || '',
    })
    setEditWordId(w.id)
    setEditOpen(true)
  }, [])

  const handleSaveWord = useCallback(async () => {
    if (!selectedDictId) return
    const mot = editForm.mot.toUpperCase().replace(/[^A-Z]/g, '')
    if (!mot) return

    const payload = {
      mot,
      definitions: editForm.definitions,
      categorie: editForm.categorie,
      notes: editForm.notes,
    }

    try {
      if (editMode === 'add') {
        await dictionariesApi.addWord(selectedDictId, payload)
      } else if (editWordId !== null) {
        await dictionariesApi.updateWord(selectedDictId, { ...payload, id: editWordId })
      }
      setEditOpen(false)
      loadWords()
    } catch (e) {
      console.error('Save failed:', e)
    }
  }, [selectedDictId, editForm, editMode, editWordId, loadWords])

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedDictId || !deleteWord) return
    try {
      await dictionariesApi.deleteWord(selectedDictId, deleteWord.id)
      setDeleteOpen(false)
      setDeleteWord(null)
      loadWords()
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }, [selectedDictId, deleteWord, loadWords])

  // ========== RENDER ==========

  return (
    <div
      className="flex h-full flex-col gap-4"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={tableRef}
    >
      {/* Header: dictionary selector + search + add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Dictionnaire :</Label>
          <Select
            value={selectedDictId ?? undefined}
            onValueChange={(val) => setSelectedDictId(Number(val))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Choisir..." />
            </SelectTrigger>
            <SelectContent>
              {dictionaries.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un mot..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button onClick={openAddDialog} disabled={!selectedDictId}>
          <Plus className="h-4 w-4" data-icon="inline-start" />
          Ajouter
        </Button>
      </div>

      {/* Results count */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {words.length} mot{words.length !== 1 ? 's' : ''}
        </Badge>
        {loading && (
          <span className="text-xs text-muted-foreground animate-pulse">Chargement...</span>
        )}
      </div>

      {/* Words table */}
      <ScrollArea className="flex-1 rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Mot</th>
              <th className="px-3 py-2 text-left font-medium w-16">Long.</th>
              <th className="px-3 py-2 text-left font-medium">Definitions</th>
              <th className="px-3 py-2 text-left font-medium w-28">Categorie</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2 text-left font-medium w-28">Date modif</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {words.map((w, i) => (
              <tr
                key={w.id}
                className={`border-b cursor-pointer transition-colors hover:bg-muted/50 ${
                  i === selectedIndex ? 'bg-primary/10 ring-1 ring-inset ring-primary/20' : ''
                }`}
                onClick={() => setSelectedIndex(i)}
                onDoubleClick={() => openEditDialog(w)}
              >
                <td className="px-3 py-2 font-mono font-semibold tracking-wider">{w.mot}</td>
                <td className="px-3 py-2 text-muted-foreground">{w.longueur}</td>
                <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">
                  {w.definitions}
                </td>
                <td className="px-3 py-2">
                  {w.categorie && (
                    <Badge variant="outline" className="text-xs">
                      {w.categorie}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 max-w-[150px] truncate text-muted-foreground">
                  {w.notes}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {w.date_modif ? new Date(w.date_modif).toLocaleDateString('fr-FR') : ''}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.stopPropagation(); openEditDialog(w) }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteWord(w)
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {words.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  {selectedDictId ? 'Aucun mot trouve.' : 'Selectionnez un dictionnaire.'}
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
              {editMode === 'add' ? 'Ajouter un mot' : 'Modifier le mot'}
            </DialogTitle>
            <DialogDescription>
              {editMode === 'add'
                ? 'Saisissez un nouveau mot et ses informations.'
                : `Modification de ${editForm.mot}`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="word-mot">Mot (A-Z uniquement)</Label>
              <Input
                id="word-mot"
                value={editForm.mot}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    mot: e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
                  }))
                }
                placeholder="EXEMPLE"
                className="font-mono tracking-wider"
                disabled={editMode === 'edit'}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="word-defs">Definitions (une par ligne)</Label>
              <textarea
                id="word-defs"
                value={editForm.definitions}
                onChange={(e) => setEditForm((f) => ({ ...f, definitions: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                placeholder="Definition 1&#10;Definition 2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="word-cat">Categorie</Label>
                <Input
                  id="word-cat"
                  value={editForm.categorie}
                  onChange={(e) => setEditForm((f) => ({ ...f, categorie: e.target.value }))}
                  placeholder="Ex: nom, verbe..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="word-notes">Notes</Label>
                <Input
                  id="word-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Notes personnelles..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveWord} disabled={!editForm.mot}>
              {editMode === 'add' ? 'Ajouter' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Delete Confirmation ========== */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le mot</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment supprimer le mot{' '}
              <span className="font-mono font-semibold">{deleteWord?.mot}</span> ? Cette action est
              irreversible.
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
