import { useState, useCallback, useMemo, useEffect, useRef, useDeferredValue } from 'react'
import { useGridEditor } from '@/hooks/useGridEditor'
import { GridCanvas } from './GridCanvas'
import { GridToolbar } from './GridToolbar'
import { NumberingDialog } from './NumberingDialog'
import { CluePanel } from './CluePanel'
import { SuggestionPanel } from '@/components/suggestion-panel/SuggestionPanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { saveGridById, loadGridById, listGrids, deleteGridById } from '@/db/queries'
import type { GridMeta } from '@/db/queries'
import type { Tool, Direction } from '@/types/grid'
import { getLabel } from '@/lib/grid-utils'
import { useNavigation } from '@/contexts/NavigationContext'
import { useDatabase } from '@/contexts/DatabaseContext'

export function GridEditorTab() {
  const editor = useGridEditor()
  const { state } = editor
  const nav = useNavigation()
  const { save: saveDb } = useDatabase()
  const [numberingOpen, setNumberingOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveAuthor, setSaveAuthor] = useState('')
  const [saveDifficulte, setSaveDifficulte] = useState('')
  const [saveThemes, setSaveThemes] = useState('')
  const [saveNomOnline, setSaveNomOnline] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [gridList, setGridList] = useState<{ id: number; nom: string; auteur: string; date_modif: string }[]>([])
  // Confirmation dialog for unsaved changes (new grid / load grid)
  const [confirmAction, setConfirmAction] = useState<{ type: 'new' | 'load'; showSave: boolean } | null>(null)
  const [confirmSaveName, setConfirmSaveName] = useState('')
  const [confirmSaveAuthor, setConfirmSaveAuthor] = useState('')
  const [confirmSaveDifficulte, setConfirmSaveDifficulte] = useState('')
  const [confirmSaveThemes, setConfirmSaveThemes] = useState('')
  const [confirmSaveNomOnline, setConfirmSaveNomOnline] = useState('')

  // Load a grid when navigating from "Mes grilles"
  useEffect(() => {
    const id = nav.clearPendingGrid()
    if (id === null) return
    try {
      const row = loadGridById(id)
      if (!row) return
      const data = row.json_data as Record<string, unknown>
      editor.loadFromData(data)
      editor.update({
        currentGridId: row.id,
        currentGridName: row.nom,
        currentGridAuthor: row.auteur,
        currentGridDifficulte: row.difficulte || '',
        currentGridThemes: row.themes ? row.themes.split(',').map(t => t.trim()).filter(Boolean) : [],
        currentGridNomOnline: row.nom_online || '',
      })
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [nav.pendingGridId])

  // Warn on reload only if the current grid has unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.modified) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.modified])

  // Auto-hide toast
  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 1500)
    return () => clearTimeout(t)
  }, [toastMessage])

  // ========== STABLE REFS for callbacks ==========
  const stateRef = useRef(state)
  stateRef.current = state
  const editorRef = useRef(editor)
  editorRef.current = editor

  const stableSelectCell = useCallback((r: number, c: number, dir?: Direction) => {
    editorRef.current.selectCell(r, c, dir)
  }, [])

  // ========== DEFERRED VALUES for low-priority panels ==========
  // Canvas gets the live state (instant feedback).
  // CluePanel and SuggestionPanel get deferred values (update after canvas paints).
  const deferredSelected = useDeferredValue(state.selected)
  const deferredDirection = useDeferredValue(state.direction)
  const deferredGridData = useDeferredValue(state.gridData)
  const deferredClues = useDeferredValue(state.clues)

  const deferredSelectedForCluePanel = useMemo(() => {
    if (!deferredSelected) return null
    return { row: deferredSelected[0], col: deferredSelected[1] }
  }, [deferredSelected])

  // ========== KEYBOARD ==========

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const s = stateRef.current
    const ed = editorRef.current

    // Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      ed.undo()
      return
    }

    if (!s.selected) return
    const [r, c] = s.selected

    // Letters
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      ed.setLetter(r, c, e.key)
      return
    }

    // Space = toggle direction
    if (e.key === ' ') {
      e.preventDefault()
      ed.toggleDirection()
      return
    }

    // Backspace
    if (e.key === 'Backspace') {
      e.preventDefault()
      ed.deleteLetter(true)
      return
    }

    // Delete
    if (e.key === 'Delete') {
      e.preventDefault()
      ed.deleteLetter(false)
      return
    }

    // Arrows
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      let nr = r, nc = c
      let newDir = s.direction
      if (e.key === 'ArrowUp') { nr = Math.max(0, r - 1); newDir = 'down' }
      if (e.key === 'ArrowDown') { nr = Math.min(s.rows - 1, r + 1); newDir = 'down' }
      if (e.key === 'ArrowLeft') { nc = Math.max(0, c - 1); newDir = 'across' }
      if (e.key === 'ArrowRight') { nc = Math.min(s.cols - 1, c + 1); newDir = 'across' }
      if (nr !== r || nc !== c) {
        ed.selectCell(nr, nc, newDir)
      }
      return
    }
  }, [])

  // ========== CELL CLICK ==========

  const handleCellClick = useCallback((r: number, c: number) => {
    const s = stateRef.current
    const ed = editorRef.current

    if (s.currentTool === 'black') {
      ed.toggleBlack(r, c)
      if (!s.blackLocked) ed.setTool('letter')
    } else if (s.currentTool === 'dotted') {
      ed.handleDottedClick(r, c)
    } else {
      // Re-click = toggle direction
      if (s.selected && s.selected[0] === r && s.selected[1] === c) {
        ed.toggleDirection()
      } else {
        ed.selectCell(r, c)
      }
    }
  }, [])

  // ========== TOOL CLICK ==========

  const handleBlackClick = useCallback(() => {
    if (state.currentTool === 'black') {
      editor.update({ blackLocked: !state.blackLocked })
    } else {
      editor.setTool('black')
    }
  }, [state.currentTool, state.blackLocked, editor])

  // ========== SAVE / LOAD ==========

  const buildMeta = useCallback((): GridMeta => ({
    nom: state.currentGridName,
    auteur: state.currentGridAuthor,
    difficulte: state.currentGridDifficulte,
    themes: state.currentGridThemes.join(', '),
    nom_online: state.currentGridNomOnline,
  }), [state.currentGridName, state.currentGridAuthor, state.currentGridDifficulte, state.currentGridThemes, state.currentGridNomOnline])

  const handleSave = useCallback(() => {
    if (state.currentGridId !== null) {
      try {
        const data = buildExportData()
        saveGridById(state.currentGridId, buildMeta(), data)
        editor.update({ modified: false })
        setToastMessage('Grille sauvegardée')
        saveDb().catch(console.error)
      } catch (e) {
        alert('Erreur : ' + (e as Error).message)
      }
    } else {
      setSaveName(state.currentGridName || '')
      setSaveAuthor(state.currentGridAuthor || '')
      setSaveDifficulte(state.currentGridDifficulte || '')
      setSaveThemes(state.currentGridThemes.join(', '))
      setSaveNomOnline(state.currentGridNomOnline || '')
      setSaveDialogOpen(true)
    }
  }, [state, editor, buildMeta])

  const handleSaveConfirm = useCallback(() => {
    if (!saveName.trim()) return
    try {
      const data = buildExportData()
      const themesArray = saveThemes.split(',').map(t => t.trim()).filter(Boolean)
      const meta: GridMeta = {
        nom: saveName.trim(),
        auteur: saveAuthor.trim(),
        difficulte: saveDifficulte.trim(),
        themes: themesArray.join(', '),
        nom_online: saveNomOnline.trim(),
      }
      const id = saveGridById(null, meta, data)
      editor.update({
        currentGridId: id,
        currentGridName: meta.nom,
        currentGridAuthor: meta.auteur,
        currentGridDifficulte: meta.difficulte,
        currentGridThemes: themesArray,
        currentGridNomOnline: meta.nom_online,
        modified: false,
      })
      setSaveDialogOpen(false)
      setToastMessage('Grille sauvegardée')
      saveDb().catch(console.error)
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [saveName, saveAuthor, saveDifficulte, saveThemes, saveNomOnline, state, editor, saveDb])

  const handleLoad = useCallback(() => {
    if (state.modified) {
      setConfirmSaveName(state.currentGridName || '')
      setConfirmSaveAuthor(state.currentGridAuthor || '')
      setConfirmSaveDifficulte(state.currentGridDifficulte || '')
      setConfirmSaveThemes(state.currentGridThemes.join(', '))
      setConfirmSaveNomOnline(state.currentGridNomOnline || '')
      setConfirmAction({ type: 'load', showSave: state.currentGridId === null })
    } else {
      openLoadDialog()
    }
  }, [state])

  const openLoadDialog = useCallback(() => {
    try {
      const grids = listGrids()
      if (grids.length === 0) { alert('Aucune grille sauvegardée.'); return }
      setGridList(grids)
      setLoadDialogOpen(true)
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [])

  // Execute the pending confirm action (discard / save-then-proceed)
  const executeConfirmAction = useCallback((saveFirst: boolean) => {
    const action = confirmAction
    if (!action) return

    if (saveFirst) {
      // Save before proceeding
      try {
        const data = buildExportData()
        if (state.currentGridId !== null) {
          // Quick save existing grid
          saveGridById(state.currentGridId, buildMeta(), data)
          editor.update({ modified: false })
        } else {
          // New save with form fields
          if (!confirmSaveName.trim()) return
          const themesArray = confirmSaveThemes.split(',').map(t => t.trim()).filter(Boolean)
          const meta: GridMeta = {
            nom: confirmSaveName.trim(),
            auteur: confirmSaveAuthor.trim(),
            difficulte: confirmSaveDifficulte.trim(),
            themes: themesArray.join(', '),
            nom_online: confirmSaveNomOnline.trim(),
          }
          const id = saveGridById(null, meta, data)
          editor.update({
            currentGridId: id,
            currentGridName: meta.nom,
            currentGridAuthor: meta.auteur,
            currentGridDifficulte: meta.difficulte,
            currentGridThemes: themesArray,
            currentGridNomOnline: meta.nom_online,
            modified: false,
          })
        }
        setToastMessage('Grille sauvegardée')
        saveDb().catch(console.error)
      } catch (e) {
        alert('Erreur : ' + (e as Error).message)
        setConfirmAction(null)
        return
      }
    }

    setConfirmAction(null)
    if (action.type === 'new') {
      editor.createGrid(state.rows, state.cols)
    } else {
      openLoadDialog()
    }
  }, [confirmAction, state, editor, buildMeta, confirmSaveName, confirmSaveAuthor, confirmSaveDifficulte, confirmSaveThemes, confirmSaveNomOnline, openLoadDialog])

  const handleLoadGrid = useCallback((id: number) => {
    try {
      const row = loadGridById(id)
      if (!row) { alert('Grille introuvable'); return }
      const data = row.json_data as Record<string, unknown>
      editor.loadFromData(data)
      editor.update({
        currentGridId: row.id,
        currentGridName: row.nom,
        currentGridAuthor: row.auteur,
        currentGridDifficulte: row.difficulte || '',
        currentGridThemes: row.themes ? row.themes.split(',').map(t => t.trim()).filter(Boolean) : [],
        currentGridNomOnline: row.nom_online || '',
      })
      setLoadDialogOpen(false)
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [editor])

  const handleDeleteGrid = useCallback((id: number, nom: string) => {
    if (!confirm(`Supprimer la grille "${nom}" ?`)) return
    try {
      deleteGridById(id)
      setGridList(prev => prev.filter(g => g.id !== id))
      // If we just deleted the currently open grid, reset
      if (state.currentGridId === id) {
        editor.update({ currentGridId: null, currentGridName: '', currentGridAuthor: '' })
      }
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [state.currentGridId, editor])

  const handleExport = useCallback(() => {
    const data = buildExportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (state.currentGridName || 'grille') + '.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [state])

  function buildExportData() {
    const { gridData, rows, cols, numberingStyle, rowNumbering, colNumbering, useSuffixes, currentGridName, clues } = state
    return {
      format: 'verbicrucix',
      version: 2,
      style: numberingStyle === 'american' ? 'american' : 'french',
      numberingStyle,
      rowNumbering,
      colNumbering,
      useSuffixes,
      title: currentGridName || 'Sans titre',
      author: state.currentGridAuthor || '',
      date: '',
      size: { rows, cols },
      grid: gridData.map(row => row.map(cell => {
        const obj: Record<string, unknown> = { black: cell.black, letter: cell.letter || '', number: cell.number || 0 }
        if (cell.dotted && Object.values(cell.dotted).some(v => v)) obj.dotted = cell.dotted
        return obj
      })),
      clues: {
        across: Object.entries(clues.across).map(([key, c]) => ({
          label: key, clue: (c as { clue?: string }).clue || '',
          row: (c as { row: number }).row, col: (c as { col: number }).col,
        })),
        down: Object.entries(clues.down).map(([key, c]) => ({
          label: key, clue: (c as { clue?: string }).clue || '',
          row: (c as { row: number }).row, col: (c as { col: number }).col,
        })),
      },
    }
  }

  // ========== CLUE PANEL ==========

  const handleClueTextChange = useCallback((payload: { direction: Direction; key: string; text: string }) => {
    editorRef.current.update(prev => {
      const newClues = { ...prev.clues }
      const dir = payload.direction
      if (newClues[dir] && newClues[dir][payload.key]) {
        newClues[dir] = { ...newClues[dir] }
        newClues[dir][payload.key] = { ...newClues[dir][payload.key], clue: payload.text }
      }
      return { clues: newClues, modified: true }
    })
  }, [])

  // ========== RENDER ==========

  return (
    <div className="relative flex h-full overflow-x-auto">
      {/* Toast — top left */}
      {toastMessage && (
        <div className="absolute left-4 top-4 z-50 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      {/* Main editor area */}
      <div className="flex min-w-[420px] flex-1 flex-col gap-3 p-4 overflow-hidden">
        {/* Toolbar */}
        <GridToolbar
          rows={state.rows}
          cols={state.cols}
          currentTool={state.currentTool}
          blackLocked={state.blackLocked}
          symmetry={state.symmetry}
          onRowsChange={r => editor.createGrid(r, state.cols)}
          onColsChange={c => editor.createGrid(state.rows, c)}
          onToolChange={(t: Tool) => editor.setTool(t)}
          onBlackClick={handleBlackClick}
          onSymmetryChange={v => editor.update({ symmetry: v })}
          onUndo={editor.undo}
          onNew={() => {
            if (state.modified) {
              setConfirmSaveName(state.currentGridName || '')
              setConfirmSaveAuthor(state.currentGridAuthor || '')
              setConfirmSaveDifficulte(state.currentGridDifficulte || '')
              setConfirmSaveThemes(state.currentGridThemes.join(', '))
              setConfirmSaveNomOnline(state.currentGridNomOnline || '')
              setConfirmAction({ type: 'new', showSave: state.currentGridId === null })
            } else {
              editor.createGrid(state.rows, state.cols)
            }
          }}
          onSave={handleSave}
          onLoad={handleLoad}
          onExport={handleExport}
          onNumbering={() => setNumberingOpen(true)}
        />

        {/* Status bar */}
        <div className="flex items-center gap-2">
          {state.currentGridName && (
            <Badge variant="outline" className="text-xs">
              {state.currentGridName}
            </Badge>
          )}
          {state.currentGridAuthor && (
            <Badge variant="outline" className="text-xs">
              {state.currentGridAuthor}
            </Badge>
          )}
          {state.modified && (
            <Badge variant="secondary" className="text-xs">
              Modifié
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {state.rows}×{state.cols}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {state.numberingStyle === 'european' ? 'Européenne' : 'Américaine'}
          </Badge>
          {state.selected && (
            <Badge variant="secondary" className="text-xs">
              ({state.numberingStyle === 'european'
                ? `${getLabel(state.selected[0] + 1, state.rowNumbering)}, ${getLabel(state.selected[1] + 1, state.colNumbering)}`
                : `${state.selected[0] + 1}, ${state.selected[1] + 1}`
              }) — {state.direction === 'across' ? 'Horizontal' : 'Vertical'}
            </Badge>
          )}
        </div>

        {/* Canvas */}
        <ScrollArea className="flex-1">
          <div className="flex items-start justify-center p-4">
            <GridCanvas
              rows={state.rows}
              cols={state.cols}
              gridData={state.gridData}
              selected={state.selected}
              highlightedCells={state.highlightedCells}
              numberingStyle={state.numberingStyle}
              rowNumbering={state.rowNumbering}
              colNumbering={state.colNumbering}
              dottedFirst={state.dottedFirst}
              previewMap={state.previewMap}
              lockedPreviewWord={state.lockedPreviewWord}
              onCellClick={handleCellClick}
              onKeyDown={handleKeyDown}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Right panel — clues (deferred: updates after canvas) */}
      <div className="w-60 shrink-0 border-l">
        <CluePanel
          clues={deferredClues}
          gridData={deferredGridData}
          rows={state.rows}
          cols={state.cols}
          selected={deferredSelectedForCluePanel}
          direction={deferredDirection}
          onSelectCell={stableSelectCell}
          onClueTextChange={handleClueTextChange}
        />
      </div>

      {/* Right panel — suggestions (deferred: updates after canvas) */}
      <SuggestionPanel
        gridData={deferredGridData}
        rows={state.rows}
        cols={state.cols}
        selected={deferredSelected}
        direction={deferredDirection}
        onPreviewWord={editor.previewWord}
        onClearPreview={editor.clearPreview}
        onLockPreview={editor.lockPreview}
        onUnlockPreview={editor.unlockPreview}
        onInsertWord={editor.insertWord}
      />

      {/* Numbering dialog */}
      <NumberingDialog
        open={numberingOpen}
        onClose={() => setNumberingOpen(false)}
        numberingStyle={state.numberingStyle}
        rowNumbering={state.rowNumbering}
        colNumbering={state.colNumbering}
        useSuffixes={state.useSuffixes}
        onApply={editor.updateNumbering}
      />

      {/* Save dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sauvegarder la grille</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Ma grille"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Auteur</Label>
              <Input
                value={saveAuthor}
                onChange={e => setSaveAuthor(e.target.value)}
                placeholder="Votre nom"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Difficulté</Label>
              <Input
                value={saveDifficulte}
                onChange={e => setSaveDifficulte(e.target.value)}
                placeholder="Facile, Moyen, Difficile..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Thèmes</Label>
              <Input
                value={saveThemes}
                onChange={e => setSaveThemes(e.target.value)}
                placeholder="Culture, Sport, Cinéma... (séparés par des virgules)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nom online</Label>
              <Input
                value={saveNomOnline}
                onChange={e => setSaveNomOnline(e.target.value)}
                placeholder="Identifiant pour le site joueur"
                onKeyDown={e => { if (e.key === 'Enter') handleSaveConfirm() }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveConfirm} disabled={!saveName.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm action dialog (new / load with unsaved changes) */}
      <Dialog open={confirmAction !== null} onOpenChange={o => { if (!o) setConfirmAction(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifications non sauvegardées</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {confirmAction?.type === 'new'
              ? 'La grille actuelle a été modifiée. Que souhaitez-vous faire avant de créer une nouvelle grille ?'
              : 'La grille actuelle a été modifiée. Que souhaitez-vous faire avant de charger une autre grille ?'}
          </p>

          {confirmAction?.showSave && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Sauvegarder sous :</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Nom *</Label>
                <Input value={confirmSaveName} onChange={e => setConfirmSaveName(e.target.value)} placeholder="Ma grille" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Auteur</Label>
                <Input value={confirmSaveAuthor} onChange={e => setConfirmSaveAuthor(e.target.value)} placeholder="Votre nom" className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Difficulté</Label>
                  <Input value={confirmSaveDifficulte} onChange={e => setConfirmSaveDifficulte(e.target.value)} placeholder="Moyen" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nom online</Label>
                  <Input value={confirmSaveNomOnline} onChange={e => setConfirmSaveNomOnline(e.target.value)} placeholder="identifiant" className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Thèmes</Label>
                <Input value={confirmSaveThemes} onChange={e => setConfirmSaveThemes(e.target.value)} placeholder="Culture, Sport..." className="h-8 text-sm" />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => executeConfirmAction(false)}>Ne pas sauvegarder</Button>
            <Button onClick={() => executeConfirmAction(true)} disabled={!!(confirmAction?.showSave && !confirmSaveName.trim())}>
              {state.currentGridId !== null ? 'Sauvegarder et continuer' : 'Enregistrer et continuer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Charger une grille</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 py-2">
              {gridList.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Aucune grille sauvegardée.
                </p>
              ) : (
                gridList.map(g => (
                  <div
                    key={g.id}
                    className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => handleLoadGrid(g.id)}
                    >
                      <div className="text-sm font-medium">{g.nom}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {g.auteur && <span>{g.auteur}</span>}
                        {g.auteur && <span>·</span>}
                        <span>{new Date(g.date_modif).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleDeleteGrid(g.id, g.nom)}
                    >
                      Supprimer
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
