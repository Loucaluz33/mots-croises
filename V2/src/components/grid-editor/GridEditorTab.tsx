import { useState, useCallback, useMemo } from 'react'
import { useGridEditor } from '@/hooks/useGridEditor'
import { GridCanvas } from './GridCanvas'
import { GridToolbar } from './GridToolbar'
import { NumberingDialog } from './NumberingDialog'
import { CluePanel } from './CluePanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { gridsApi } from '@/api/client'
import type { Tool, Direction } from '@/types/grid'

export function GridEditorTab() {
  const editor = useGridEditor()
  const { state } = editor
  const [numberingOpen, setNumberingOpen] = useState(false)

  // ========== KEYBOARD ==========

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      editor.undo()
      return
    }

    if (!state.selected) return
    const [r, c] = state.selected

    // Letters
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      editor.setLetter(r, c, e.key)
      return
    }

    // Space = toggle direction
    if (e.key === ' ') {
      e.preventDefault()
      editor.toggleDirection()
      return
    }

    // Backspace
    if (e.key === 'Backspace') {
      e.preventDefault()
      editor.deleteLetter(true)
      return
    }

    // Delete
    if (e.key === 'Delete') {
      e.preventDefault()
      editor.deleteLetter(false)
      return
    }

    // Arrows
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      let nr = r, nc = c
      let newDir = state.direction
      if (e.key === 'ArrowUp') { nr = Math.max(0, r - 1); newDir = 'down' }
      if (e.key === 'ArrowDown') { nr = Math.min(state.rows - 1, r + 1); newDir = 'down' }
      if (e.key === 'ArrowLeft') { nc = Math.max(0, c - 1); newDir = 'across' }
      if (e.key === 'ArrowRight') { nc = Math.min(state.cols - 1, c + 1); newDir = 'across' }
      if (nr !== r || nc !== c) {
        editor.selectCell(nr, nc, newDir)
      }
      return
    }
  }, [state.selected, state.direction, state.rows, state.cols, editor])

  // ========== CELL CLICK ==========

  const handleCellClick = useCallback((r: number, c: number) => {
    if (state.currentTool === 'black') {
      editor.toggleBlack(r, c)
      if (!state.blackLocked) editor.setTool('letter')
    } else if (state.currentTool === 'dotted') {
      editor.handleDottedClick(r, c)
    } else {
      // Re-click = toggle direction
      if (state.selected && state.selected[0] === r && state.selected[1] === c) {
        editor.toggleDirection()
      } else {
        editor.selectCell(r, c)
      }
    }
  }, [state.currentTool, state.blackLocked, state.selected, editor])

  // ========== TOOL CLICK ==========

  const handleBlackClick = useCallback(() => {
    if (state.currentTool === 'black') {
      editor.update({ blackLocked: !state.blackLocked })
    } else {
      editor.setTool('black')
    }
  }, [state.currentTool, state.blackLocked, editor])

  // ========== SAVE / LOAD ==========

  const handleSave = useCallback(async () => {
    let name = state.currentGridName || prompt('Nom de la grille :')
    if (!name) return
    try {
      const data = buildExportData()
      await gridsApi.save(name, data)
      editor.update({ currentGridName: name, modified: false })
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [state, editor])

  const handleLoad = useCallback(async () => {
    if (state.modified && !confirm('Grille modifiée. Charger une autre grille ?')) return
    try {
      const result = await gridsApi.list()
      const grids = result.grids
      if (grids.length === 0) { alert('Aucune grille sauvegardée.'); return }
      // For now, simple prompt - we'll add a proper dialog later
      const name = prompt('Nom de la grille à charger :\n' + grids.map(g => g.nom).join('\n'))
      if (!name) return
      const gridResult = await gridsApi.get(name)
      const data = JSON.parse(gridResult.grid)
      editor.loadFromData(data)
      editor.update({ currentGridName: name })
    } catch (e) {
      alert('Erreur : ' + (e as Error).message)
    }
  }, [state.modified, editor])

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
      format: 'verbicruciste',
      version: 2,
      style: numberingStyle === 'american' ? 'american' : 'french',
      numberingStyle,
      rowNumbering,
      colNumbering,
      useSuffixes,
      title: currentGridName || 'Sans titre',
      author: '',
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

  const selectedForCluePanel = useMemo(() => {
    if (!state.selected) return null
    return { row: state.selected[0], col: state.selected[1] }
  }, [state.selected])

  const handleClueTextChange = useCallback((payload: { direction: Direction; key: string; text: string }) => {
    editor.update(prev => {
      const newClues = { ...prev.clues }
      const dir = payload.direction
      if (newClues[dir] && newClues[dir][payload.key]) {
        newClues[dir] = { ...newClues[dir] }
        newClues[dir][payload.key] = { ...newClues[dir][payload.key], clue: payload.text }
      }
      return { clues: newClues, modified: true }
    })
  }, [editor])

  // ========== RENDER ==========

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex flex-1 flex-col gap-3 p-4 overflow-hidden">
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
            if (state.modified && !confirm('Grille modifiée. Créer une nouvelle grille ?')) return
            editor.createGrid(state.rows, state.cols)
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
              ({state.selected[0] + 1}, {state.selected[1] + 1}) — {state.direction === 'across' ? 'Horizontal' : 'Vertical'}
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

      {/* Right panel — clues */}
      <CluePanel
        clues={state.clues}
        gridData={state.gridData}
        rows={state.rows}
        cols={state.cols}
        selected={selectedForCluePanel}
        direction={state.direction}
        onSelectCell={(r, c, dir) => editor.selectCell(r, c, dir)}
        onClueTextChange={handleClueTextChange}
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
    </div>
  )
}
