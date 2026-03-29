import type { GridCell, LabelFormat, NumberingStyle, Direction, GridClues, DottedBorders } from '@/types/grid'

// ========== LABEL UTILS ==========

export function toRoman(n: number): string {
  const vals: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let result = ''
  for (const [val, numeral] of vals) {
    while (n >= val) { result += numeral; n -= val }
  }
  return result
}

export function toAlpha(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - m) / 26)
  }
  return s
}

export function getLabel(n: number, type: LabelFormat): string {
  if (type === 'roman') return toRoman(n)
  if (type === 'alpha') return toAlpha(n)
  return String(n)
}

// ========== GRID LOGIC ==========

export function createEmptyGrid(rows: number, cols: number): GridCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      black: false,
      letter: '',
      number: 0,
      dotted: null,
    }))
  )
}

export function getWordCells(
  gridData: GridCell[][],
  r: number, c: number,
  dir: Direction,
  rows: number, cols: number
): [number, number][] {
  if (gridData[r][c].black) return []
  const cells: [number, number][] = []
  if (dir === 'across') {
    let startC = c
    while (startC > 0 && !gridData[r][startC - 1].black) startC--
    let endC = c
    while (endC < cols - 1 && !gridData[r][endC + 1].black) endC++
    for (let i = startC; i <= endC; i++) cells.push([r, i])
  } else {
    let startR = r
    while (startR > 0 && !gridData[startR - 1][c].black) startR--
    let endR = r
    while (endR < rows - 1 && !gridData[endR + 1][c].black) endR++
    for (let i = startR; i <= endR; i++) cells.push([i, c])
  }
  return cells
}

export function getCellsFromSelected(
  gridData: GridCell[][],
  r: number, c: number,
  dir: Direction,
  rows: number, cols: number
): [number, number][] {
  if (gridData[r][c].black) return []
  const cells: [number, number][] = []
  if (dir === 'across') {
    let endC = c
    while (endC < cols - 1 && !gridData[r][endC + 1].black) endC++
    for (let i = c; i <= endC; i++) cells.push([r, i])
  } else {
    let endR = r
    while (endR < rows - 1 && !gridData[endR + 1][c].black) endR++
    for (let i = r; i <= endR; i++) cells.push([i, c])
  }
  return cells
}

export function getWord(gridData: GridCell[][], r: number, c: number, dir: Direction, rows: number, cols: number): string {
  const cells = getWordCells(gridData, r, c, dir, rows, cols)
  return cells.map(([cr, cc]) => gridData[cr][cc].letter || ' ').join('')
}

// ========== AUTO-NUMBERING ==========

interface ClueEntry {
  label: string
  row: number
  col: number
  clue: string
  isSubClue?: boolean
  subIndex?: number
}

function findOldClue(oldDir: Record<string, ClueEntry>, r: number, c: number): string {
  for (const v of Object.values(oldDir)) {
    if (v.row === r && v.col === c) return v.clue || ''
  }
  return ''
}

export function autoNumber(
  gridData: GridCell[][],
  rows: number,
  cols: number,
  numberingStyle: NumberingStyle,
  rowNumbering: LabelFormat,
  colNumbering: LabelFormat,
  useSuffixes: boolean,
  oldClues: GridClues
): GridClues {
  const clues: GridClues = { across: {}, down: {} }

  // Reset numbers
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      gridData[r][c].number = 0

  // Assign numbers to cells that start a word
  let num = 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (gridData[r][c].black) continue
      const startsH = (c === 0 || gridData[r][c - 1].black) && c + 1 < cols && !gridData[r][c + 1].black
      const startsV = (r === 0 || gridData[r - 1][c].black) && r + 1 < rows && !gridData[r + 1][c].black
      if (startsH || startsV) {
        gridData[r][c].number = num++
      }
    }
  }

  if (numberingStyle === 'european') {
    // Horizontal
    for (let r = 0; r < rows; r++) {
      const wordsInRow: number[] = []
      let c = 0
      while (c < cols) {
        if (!gridData[r][c].black) {
          const startC = c
          while (c < cols && !gridData[r][c].black) c++
          if (c - startC >= 2) wordsInRow.push(startC)
        } else { c++ }
      }

      const labelBase = getLabel(r + 1, rowNumbering)
      if (wordsInRow.length === 0) continue

      if (!useSuffixes && wordsInRow.length > 1) {
        for (let i = 0; i < wordsInRow.length; i++) {
          const key = `${labelBase}.${i}`
          const oldClue = findOldClue(oldClues.across as Record<string, ClueEntry>, r, wordsInRow[i])
          clues.across[key] = { label: labelBase, row: r, col: wordsInRow[i], clue: oldClue, key, isSubClue: true, subIndex: i } as never
        }
      } else if (wordsInRow.length === 1) {
        const key = labelBase
        const oldClue = findOldClue(oldClues.across as Record<string, ClueEntry>, r, wordsInRow[0])
        clues.across[key] = { label: labelBase, row: r, col: wordsInRow[0], clue: oldClue, key } as never
      } else {
        for (let i = 0; i < wordsInRow.length; i++) {
          const suffix = String.fromCharCode(97 + i)
          const key = `${labelBase}.${suffix}`
          const oldClue = findOldClue(oldClues.across as Record<string, ClueEntry>, r, wordsInRow[i])
          clues.across[key] = { label: key, row: r, col: wordsInRow[i], clue: oldClue, key } as never
        }
      }
    }

    // Vertical
    for (let c = 0; c < cols; c++) {
      const wordsInCol: number[] = []
      let r = 0
      while (r < rows) {
        if (!gridData[r][c].black) {
          const startR = r
          while (r < rows && !gridData[r][c].black) r++
          if (r - startR >= 2) wordsInCol.push(startR)
        } else { r++ }
      }

      const labelBase = getLabel(c + 1, colNumbering)
      if (wordsInCol.length === 0) continue

      if (!useSuffixes && wordsInCol.length > 1) {
        for (let i = 0; i < wordsInCol.length; i++) {
          const key = `${labelBase}.${i}`
          const oldClue = findOldClue(oldClues.down as Record<string, ClueEntry>, wordsInCol[i], c)
          clues.down[key] = { label: labelBase, row: wordsInCol[i], col: c, clue: oldClue, key, isSubClue: true, subIndex: i } as never
        }
      } else if (wordsInCol.length === 1) {
        const key = labelBase
        const oldClue = findOldClue(oldClues.down as Record<string, ClueEntry>, wordsInCol[0], c)
        clues.down[key] = { label: labelBase, row: wordsInCol[0], col: c, clue: oldClue, key } as never
      } else {
        for (let i = 0; i < wordsInCol.length; i++) {
          const suffix = String.fromCharCode(97 + i)
          const key = `${labelBase}.${suffix}`
          const oldClue = findOldClue(oldClues.down as Record<string, ClueEntry>, wordsInCol[i], c)
          clues.down[key] = { label: key, row: wordsInCol[i], col: c, clue: oldClue, key } as never
        }
      }
    }
  } else {
    // American style
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (gridData[r][c].black) continue
        const cellNum = gridData[r][c].number
        if (!cellNum) continue

        if ((c === 0 || gridData[r][c - 1].black) && c + 1 < cols && !gridData[r][c + 1].black) {
          const key = String(cellNum)
          const oldClue = findOldClue(oldClues.across as Record<string, ClueEntry>, r, c)
          clues.across[key] = { label: key, row: r, col: c, clue: oldClue, key } as never
        }
        if ((r === 0 || gridData[r - 1][c].black) && r + 1 < rows && !gridData[r + 1][c].black) {
          const key = String(cellNum)
          const oldClue = findOldClue(oldClues.down as Record<string, ClueEntry>, r, c)
          clues.down[key] = { label: key, row: r, col: c, clue: oldClue, key } as never
        }
      }
    }
  }

  return clues
}

// ========== GENERAL UTILS ==========

export function stripAccents(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeForGrid(text: string): string {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '')
}

export function ensureDotted(cell: GridCell): DottedBorders {
  if (!cell.dotted) {
    cell.dotted = { top: false, bottom: false, left: false, right: false }
  }
  return cell.dotted
}
