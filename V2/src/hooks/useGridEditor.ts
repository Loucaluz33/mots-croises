import { useState, useCallback, useRef } from 'react'
import type { GridCell, Direction, Tool, NumberingStyle, LabelFormat, GridClues } from '@/types/grid'
import { createEmptyGrid, autoNumber as autoNumberFn, getWordCells, getCellsFromSelected, ensureDotted } from '@/lib/grid-utils'

const MAX_UNDO = 100

export interface GridEditorState {
  rows: number
  cols: number
  gridData: GridCell[][]
  selected: [number, number] | null
  direction: Direction
  highlightedCells: [number, number][]
  currentTool: Tool
  blackLocked: boolean
  symmetry: boolean
  numberingStyle: NumberingStyle
  rowNumbering: LabelFormat
  colNumbering: LabelFormat
  useSuffixes: boolean
  clues: GridClues
  modified: boolean
  currentGridName: string
  dottedFirst: [number, number] | null
  previewMap: Map<number, string> | null
  lockedPreviewWord: string | null
}

export function useGridEditor() {
  const [state, setState] = useState<GridEditorState>(() => {
    const grid = createEmptyGrid(10, 10)
    const clues = autoNumberFn(grid, 10, 10, 'european', 'roman', 'arabic', true, { across: {}, down: {} })
    return {
      rows: 10,
      cols: 10,
      gridData: grid,
      selected: null,
      direction: 'across' as Direction,
      highlightedCells: [],
      currentTool: 'letter' as Tool,
      blackLocked: false,
      symmetry: false,
      numberingStyle: 'european' as NumberingStyle,
      rowNumbering: 'roman' as LabelFormat,
      colNumbering: 'arabic' as LabelFormat,
      useSuffixes: true,
      clues,
      modified: false,
      currentGridName: '',
      dottedFirst: null,
      previewMap: null,
      lockedPreviewWord: null,
    }
  })

  const undoStackRef = useRef<GridCell[][][]>([])

  const saveUndoState = useCallback(() => {
    const snapshot = state.gridData.map(row =>
      row.map(cell => ({
        ...cell,
        dotted: cell.dotted ? { ...cell.dotted } : null,
      }))
    )
    undoStackRef.current.push(snapshot)
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift()
  }, [state.gridData])

  const update = useCallback((partial: Partial<GridEditorState> | ((prev: GridEditorState) => Partial<GridEditorState>)) => {
    setState(prev => {
      const changes = typeof partial === 'function' ? partial(prev) : partial
      return { ...prev, ...changes }
    })
  }, [])

  const createGrid = useCallback((rows: number, cols: number) => {
    const grid = createEmptyGrid(rows, cols)
    const clues = autoNumberFn(grid, rows, cols, state.numberingStyle, state.rowNumbering, state.colNumbering, state.useSuffixes, { across: {}, down: {} })
    undoStackRef.current = []
    update({
      rows, cols, gridData: grid, clues,
      selected: null, highlightedCells: [],
      modified: false, currentGridName: '',
      dottedFirst: null, previewMap: null, lockedPreviewWord: null,
    })
  }, [state.numberingStyle, state.rowNumbering, state.colNumbering, state.useSuffixes, update])

  const reNumber = useCallback((gridData: GridCell[][], rows: number, cols: number, style: NumberingStyle, rowNum: LabelFormat, colNum: LabelFormat, suffixes: boolean, oldClues: GridClues) => {
    return autoNumberFn(gridData, rows, cols, style, rowNum, colNum, suffixes, oldClues)
  }, [])

  const selectCell = useCallback((r: number, c: number, dir?: Direction) => {
    setState(prev => {
      if (prev.gridData[r][c].black) return prev
      const newDir = dir ?? prev.direction
      const highlighted = getWordCells(prev.gridData, r, c, newDir, prev.rows, prev.cols)
      return {
        ...prev,
        selected: [r, c],
        direction: newDir,
        highlightedCells: highlighted,
      }
    })
  }, [])

  const toggleBlack = useCallback((r: number, c: number) => {
    saveUndoState()
    setState(prev => {
      const newGrid = prev.gridData.map(row => row.map(cell => ({ ...cell, dotted: cell.dotted ? { ...cell.dotted } : null })))
      newGrid[r][c].black = !newGrid[r][c].black
      newGrid[r][c].letter = ''
      newGrid[r][c].number = 0

      if (prev.symmetry) {
        const sr = prev.rows - 1 - r
        const sc = prev.cols - 1 - c
        if (sr !== r || sc !== c) {
          newGrid[sr][sc].black = newGrid[r][c].black
          newGrid[sr][sc].letter = ''
          newGrid[sr][sc].number = 0
        }
      }

      const clues = autoNumberFn(newGrid, prev.rows, prev.cols, prev.numberingStyle, prev.rowNumbering, prev.colNumbering, prev.useSuffixes, prev.clues)
      return { ...prev, gridData: newGrid, clues, modified: true }
    })
  }, [saveUndoState])

  const handleDottedClick = useCallback((r: number, c: number) => {
    setState(prev => {
      if (prev.gridData[r][c].black) return prev

      if (!prev.dottedFirst) {
        return { ...prev, dottedFirst: [r, c] }
      }

      const [r1, c1] = prev.dottedFirst
      const dr = r - r1, dc = c - c1
      if (Math.abs(dr) + Math.abs(dc) !== 1) {
        return { ...prev, dottedFirst: null }
      }

      const newGrid = prev.gridData.map(row => row.map(cell => ({ ...cell, dotted: cell.dotted ? { ...cell.dotted } : null })))
      ensureDotted(newGrid[r1][c1])
      ensureDotted(newGrid[r][c])

      if (dr === -1) {
        newGrid[r1][c1].dotted!.top = !newGrid[r1][c1].dotted!.top
        newGrid[r][c].dotted!.bottom = newGrid[r1][c1].dotted!.top
      } else if (dr === 1) {
        newGrid[r1][c1].dotted!.bottom = !newGrid[r1][c1].dotted!.bottom
        newGrid[r][c].dotted!.top = newGrid[r1][c1].dotted!.bottom
      } else if (dc === -1) {
        newGrid[r1][c1].dotted!.left = !newGrid[r1][c1].dotted!.left
        newGrid[r][c].dotted!.right = newGrid[r1][c1].dotted!.left
      } else if (dc === 1) {
        newGrid[r1][c1].dotted!.right = !newGrid[r1][c1].dotted!.right
        newGrid[r][c].dotted!.left = newGrid[r1][c1].dotted!.right
      }

      return { ...prev, gridData: newGrid, dottedFirst: null, modified: true }
    })
  }, [])

  const setLetter = useCallback((r: number, c: number, letter: string) => {
    saveUndoState()
    setState(prev => {
      const newGrid = prev.gridData.map(row => row.map(cell => ({ ...cell, dotted: cell.dotted ? { ...cell.dotted } : null })))
      newGrid[r][c].letter = letter.toUpperCase()

      // Advance cursor
      let [nr, nc] = [r, c]
      if (prev.direction === 'across') {
        nc++
        while (nc < prev.cols && newGrid[nr][nc].black) nc++
        if (nc >= prev.cols) { nr = r; nc = c }
      } else {
        nr++
        while (nr < prev.rows && newGrid[nr][nc].black) nr++
        if (nr >= prev.rows) { nr = r; nc = c }
      }

      const newSelected: [number, number] = [nr, nc]
      const clues = autoNumberFn(newGrid, prev.rows, prev.cols, prev.numberingStyle, prev.rowNumbering, prev.colNumbering, prev.useSuffixes, prev.clues)
      const highlighted = getWordCells(newGrid, nr, nc, prev.direction, prev.rows, prev.cols)

      return {
        ...prev,
        gridData: newGrid,
        selected: newSelected,
        highlightedCells: highlighted,
        clues,
        modified: true,
        currentTool: 'letter',
      }
    })
  }, [saveUndoState])

  const deleteLetter = useCallback((backspace: boolean) => {
    saveUndoState()
    setState(prev => {
      if (!prev.selected) return prev
      const [r, c] = prev.selected
      const newGrid = prev.gridData.map(row => row.map(cell => ({ ...cell, dotted: cell.dotted ? { ...cell.dotted } : null })))

      if (backspace && !newGrid[r][c].letter) {
        // Retreat cursor
        let [nr, nc] = [r, c]
        if (prev.direction === 'across') {
          nc--
          while (nc >= 0 && newGrid[nr][nc].black) nc--
          if (nc < 0) return prev
        } else {
          nr--
          while (nr >= 0 && newGrid[nr][nc].black) nr--
          if (nr < 0) return prev
        }
        newGrid[nr][nc].letter = ''
        const highlighted = getWordCells(newGrid, nr, nc, prev.direction, prev.rows, prev.cols)
        const clues = autoNumberFn(newGrid, prev.rows, prev.cols, prev.numberingStyle, prev.rowNumbering, prev.colNumbering, prev.useSuffixes, prev.clues)
        return { ...prev, gridData: newGrid, selected: [nr, nc], highlightedCells: highlighted, clues, modified: true }
      } else {
        newGrid[r][c].letter = ''
        const clues = autoNumberFn(newGrid, prev.rows, prev.cols, prev.numberingStyle, prev.rowNumbering, prev.colNumbering, prev.useSuffixes, prev.clues)
        return { ...prev, gridData: newGrid, clues, modified: true }
      }
    })
  }, [saveUndoState])

  const undo = useCallback(() => {
    const snapshot = undoStackRef.current.pop()
    if (!snapshot) return
    setState(prev => {
      const clues = autoNumberFn(snapshot, prev.rows, prev.cols, prev.numberingStyle, prev.rowNumbering, prev.colNumbering, prev.useSuffixes, prev.clues)
      return { ...prev, gridData: snapshot, clues, modified: true }
    })
  }, [])

  const setTool = useCallback((tool: Tool) => {
    update({ currentTool: tool, blackLocked: false, dottedFirst: null })
  }, [update])

  const toggleDirection = useCallback(() => {
    setState(prev => {
      const newDir = prev.direction === 'across' ? 'down' : 'across'
      const highlighted = prev.selected
        ? getWordCells(prev.gridData, prev.selected[0], prev.selected[1], newDir, prev.rows, prev.cols)
        : []
      return { ...prev, direction: newDir, highlightedCells: highlighted }
    })
  }, [])

  const updateNumbering = useCallback((
    style: NumberingStyle,
    rowNum: LabelFormat,
    colNum: LabelFormat,
    suffixes: boolean
  ) => {
    setState(prev => {
      const clues = autoNumberFn(prev.gridData, prev.rows, prev.cols, style, rowNum, colNum, suffixes, prev.clues)
      return {
        ...prev,
        numberingStyle: style,
        rowNumbering: rowNum,
        colNumbering: colNum,
        useSuffixes: suffixes,
        clues,
        modified: true,
      }
    })
  }, [])

  const insertWord = useCallback((word: string) => {
    saveUndoState()
    setState(prev => {
      if (!prev.selected) return prev
      const [r, c] = prev.selected
      if (prev.gridData[r][c].black) return prev
      const cells = getCellsFromSelected(prev.gridData, r, c, prev.direction, prev.rows, prev.cols)
      const upper = word.toUpperCase()
      if (upper.length > cells.length) return prev

      const newGrid = prev.gridData.map(row => row.map(cell => ({ ...cell, dotted: cell.dotted ? { ...cell.dotted } : null })))
      for (let i = 0; i < upper.length; i++) {
        newGrid[cells[i][0]][cells[i][1]].letter = upper[i]
      }
      const clues = autoNumberFn(newGrid, prev.rows, prev.cols, prev.numberingStyle, prev.rowNumbering, prev.colNumbering, prev.useSuffixes, prev.clues)
      return { ...prev, gridData: newGrid, clues, modified: true, previewMap: null, lockedPreviewWord: null }
    })
  }, [saveUndoState])

  const loadFromData = useCallback((data: Record<string, unknown>) => {
    const d = data as {
      size: { rows: number; cols: number }
      numberingStyle?: string
      style?: string
      rowNumbering?: string
      colNumbering?: string
      useSuffixes?: boolean
      grid: { black: boolean; letter?: string; number?: number; dotted?: GridCell['dotted'] }[][]
      clues?: { across?: { label: string; row: number; col: number; clue?: string }[]; down?: { label: string; row: number; col: number; clue?: string }[] }
    }

    const rows = d.size.rows
    const cols = d.size.cols
    const nStyle = (d.numberingStyle || (d.style === 'american' ? 'american' : 'european')) as NumberingStyle
    const rNum = (d.rowNumbering || 'roman') as LabelFormat
    const cNum = (d.colNumbering || 'arabic') as LabelFormat
    const suffixes = d.useSuffixes !== undefined ? d.useSuffixes : true

    const gridData: GridCell[][] = d.grid.map(row => row.map(cell => ({
      black: cell.black,
      letter: cell.letter || '',
      number: cell.number || 0,
      dotted: cell.dotted || null,
    })))

    const loadedClues: GridClues = { across: {}, down: {} }
    for (const c of (d.clues?.across || [])) {
      const key = c.label
      loadedClues.across[key] = { label: key, row: c.row, col: c.col, clue: c.clue || '', key }
    }
    for (const c of (d.clues?.down || [])) {
      const key = c.label
      loadedClues.down[key] = { label: key, row: c.row, col: c.col, clue: c.clue || '', key }
    }

    const clues = autoNumberFn(gridData, rows, cols, nStyle, rNum, cNum, suffixes, loadedClues)
    undoStackRef.current = []

    update({
      rows, cols, gridData, clues,
      numberingStyle: nStyle,
      rowNumbering: rNum,
      colNumbering: cNum,
      useSuffixes: suffixes,
      selected: null,
      highlightedCells: [],
      modified: false,
      dottedFirst: null,
      previewMap: null,
      lockedPreviewWord: null,
    })
  }, [update])

  return {
    state,
    update,
    createGrid,
    reNumber,
    selectCell,
    toggleBlack,
    handleDottedClick,
    setLetter,
    deleteLetter,
    undo,
    setTool,
    toggleDirection,
    updateNumbering,
    insertWord,
    loadFromData,
  }
}
