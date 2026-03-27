import { useRef, useEffect, useCallback } from 'react'
import type { GridCell, NumberingStyle, LabelFormat, Direction } from '@/types/grid'
import { getLabel } from '@/lib/grid-utils'

const CELL_SIZE = 44
const HEADER_SIZE = 30

const COLORS = {
  black: '#0f172a',
  white: '#ffffff',
  selected: '#bfdbfe',
  highlight: '#dbeafe',
  headerBg: '#f1f5f9',
  headerText: '#6366f1',
  number: '#64748b',
  letter: '#0f172a',
  gridLine: '#94a3b8',
  dotted: '#6366f1',
  dottedIndicator: '#f59e0b',
  previewLocked: '#6366f1',
  previewHover: '#cbd5e1',
}

interface GridCanvasProps {
  rows: number
  cols: number
  gridData: GridCell[][]
  selected: [number, number] | null
  highlightedCells: [number, number][]
  numberingStyle: NumberingStyle
  rowNumbering: LabelFormat
  colNumbering: LabelFormat
  dottedFirst: [number, number] | null
  previewMap: Map<number, string> | null
  lockedPreviewWord: string | null
  onCellClick: (r: number, c: number) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export function GridCanvas({
  rows, cols, gridData, selected, highlightedCells,
  numberingStyle, rowNumbering, colNumbering,
  dottedFirst, previewMap, lockedPreviewWord,
  onCellClick, onKeyDown,
}: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const offset = numberingStyle === 'european' ? HEADER_SIZE : 0
  const canvasW = offset + cols * CELL_SIZE + 1
  const canvasH = offset + rows * CELL_SIZE + 1

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasW, canvasH)

    // Headers (European only)
    if (numberingStyle === 'european') {
      ctx.fillStyle = COLORS.headerBg
      ctx.fillRect(0, 0, canvasW, HEADER_SIZE)
      ctx.fillRect(0, 0, HEADER_SIZE, canvasH)

      ctx.fillStyle = COLORS.headerText
      ctx.font = 'bold 11px -apple-system, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (let c = 0; c < cols; c++) {
        const x = HEADER_SIZE + c * CELL_SIZE + CELL_SIZE / 2
        ctx.fillText(getLabel(c + 1, colNumbering), x, HEADER_SIZE / 2)
      }

      for (let r = 0; r < rows; r++) {
        const y = HEADER_SIZE + r * CELL_SIZE + CELL_SIZE / 2
        const label = getLabel(r + 1, rowNumbering)
        ctx.font = `bold ${label.length > 3 ? 9 : 11}px -apple-system, system-ui, sans-serif`
        ctx.fillText(label, HEADER_SIZE / 2, y)
      }
    }

    // Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = offset + c * CELL_SIZE
        const y = offset + r * CELL_SIZE
        const cell = gridData[r][c]

        // Background
        if (cell.black) {
          ctx.fillStyle = COLORS.black
        } else if (selected && selected[0] === r && selected[1] === c) {
          ctx.fillStyle = COLORS.selected
        } else if (highlightedCells.some(([hr, hc]) => hr === r && hc === c)) {
          ctx.fillStyle = COLORS.highlight
        } else {
          ctx.fillStyle = COLORS.white
        }
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)

        // Grid lines
        ctx.strokeStyle = COLORS.gridLine
        ctx.lineWidth = 0.5
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE)

        if (!cell.black) {
          // Number (American)
          if (numberingStyle === 'american' && cell.number > 0) {
            ctx.fillStyle = COLORS.number
            ctx.font = '9px -apple-system, system-ui, sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(String(cell.number), x + 2, y + 2)
          }

          // Letter or preview
          const preview = previewMap?.get(r * 100 + c)
          if (cell.letter) {
            ctx.fillStyle = COLORS.letter
            ctx.font = 'bold 20px -apple-system, system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(cell.letter, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1)
          } else if (preview) {
            ctx.fillStyle = lockedPreviewWord ? COLORS.previewLocked : COLORS.previewHover
            ctx.font = 'bold 20px -apple-system, system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(preview, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1)
          }

          // Dotted borders
          const dotted = cell.dotted
          if (dotted) {
            ctx.strokeStyle = COLORS.dotted
            ctx.lineWidth = 2
            ctx.setLineDash([4, 3])
            if (dotted.top) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + CELL_SIZE, y); ctx.stroke() }
            if (dotted.bottom) { ctx.beginPath(); ctx.moveTo(x, y + CELL_SIZE); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); ctx.stroke() }
            if (dotted.left) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + CELL_SIZE); ctx.stroke() }
            if (dotted.right) { ctx.beginPath(); ctx.moveTo(x + CELL_SIZE, y); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); ctx.stroke() }
            ctx.setLineDash([])
          }
        }
      }
    }

    // Dotted first selection indicator
    if (dottedFirst) {
      const [dr, dc] = dottedFirst
      const x = offset + dc * CELL_SIZE
      const y = offset + dr * CELL_SIZE
      ctx.strokeStyle = COLORS.dottedIndicator
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2)
    }
  }, [rows, cols, gridData, selected, highlightedCells, numberingStyle, rowNumbering, colNumbering, dottedFirst, previewMap, lockedPreviewWord, offset, canvasW, canvasH])

  useEffect(() => {
    render()
  }, [render])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const c = Math.floor((mx - offset) / CELL_SIZE)
    const r = Math.floor((my - offset) / CELL_SIZE)
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      onCellClick(r, c)
    }
    canvas.focus()
  }, [offset, rows, cols, onCellClick])

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      style={{ width: canvasW, height: canvasH }}
      className="cursor-pointer outline-none rounded-lg shadow-sm border border-border"
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={onKeyDown}
    />
  )
}
