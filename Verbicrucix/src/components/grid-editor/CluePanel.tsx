import { useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import type { GridClues, GridCell, Direction, Clue } from '@/types/grid'
import { getWordCells, getLabel } from '@/lib/grid-utils'

// ========== TYPES ==========

interface CluePanelProps {
  clues: GridClues
  gridData: GridCell[][]
  rows: number
  cols: number
  selected: { row: number; col: number } | null
  direction: Direction
  onSelectCell: (row: number, col: number, direction: Direction) => void
  onClueTextChange: (payload: { direction: Direction; key: string; text: string }) => void
}

interface ClueWithKey extends Clue {
  key: string
}

interface ClueGroup {
  label: string
  clues: ClueWithKey[]
  sortValue: number
}

// ========== SORTING HELPERS ==========

function romanToInt(s: string): number {
  const map: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
  }
  let result = 0
  for (let i = 0; i < s.length; i++) {
    const val = map[s[i]] || 0
    const next = map[s[i + 1]] || 0
    result += val < next ? -val : val
  }
  return result || 0
}

function clueKeySort(key: string): number {
  const parts = key.split('.')
  const base = parts[0]
  // Try parsing as number first (american), then as roman numeral (european)
  let num = parseInt(base, 10)
  if (isNaN(num)) {
    num = romanToInt(base)
  }
  // Suffix: "a" → 1, "b" → 2, or numeric sub-index "0" → 0, "1" → 1
  let suffix = 0
  if (parts[1] !== undefined) {
    const parsed = parseInt(parts[1], 10)
    if (!isNaN(parsed)) {
      suffix = parsed
    } else {
      suffix = parts[1].charCodeAt(0) - 96
    }
  }
  return num * 100 + suffix
}

// ========== WORD DISPLAY ==========

function getWordDisplay(
  gridData: GridCell[][],
  row: number,
  col: number,
  dir: Direction,
  rows: number,
  cols: number,
): { display: string; isComplete: boolean } {
  const cells = getWordCells(gridData, row, col, dir, rows, cols)
  // Only keep cells from the start position forward
  const filtered = cells.filter(([r, c]) =>
    dir === 'across' ? r === row && c >= col : c === col && r >= row,
  )
  const letters = filtered.map(([r, c]) => gridData[r][c].letter || '')
  const display = letters.map((l) => (l ? l : '\u00B7')).join('')
  const isComplete = letters.every((l) => l !== '')
  return { display, isComplete }
}

// ========== GROUP CLUES ==========

function groupClues(clueDir: Record<string, Clue>): ClueGroup[] {
  const grouped: Record<string, ClueWithKey[]> = {}

  for (const [key, clue] of Object.entries(clueDir)) {
    const baseLabel = clue.label
    if (!grouped[baseLabel]) grouped[baseLabel] = []
    grouped[baseLabel].push({ ...clue, key })
  }

  const groups: ClueGroup[] = Object.entries(grouped).map(([label, clues]) => ({
    label,
    clues: clues.sort((a, b) => clueKeySort(a.key) - clueKeySort(b.key)),
    sortValue: clueKeySort(clues[0].key),
  }))

  groups.sort((a, b) => a.sortValue - b.sortValue)
  return groups
}

// ========== ACTIVE CLUE DETECTION ==========

function isClueActive(
  clue: ClueWithKey,
  dir: Direction,
  selected: { row: number; col: number } | null,
  currentDir: Direction,
  gridData: GridCell[][],
  rows: number,
  cols: number,
): boolean {
  if (!selected || dir !== currentDir) return false
  const cells = getWordCells(gridData, clue.row, clue.col, dir, rows, cols)
  return cells.some(([r, c]) => r === selected.row && c === selected.col)
}

// ========== CLUE SECTION COMPONENT ==========

function ClueSection({
  title,
  dir,
  groups,
  gridData,
  rows,
  cols,
  selected,
  currentDir,
  onSelectCell,
  onClueTextChange,
}: {
  title: string
  dir: Direction
  groups: ClueGroup[]
  gridData: GridCell[][]
  rows: number
  cols: number
  selected: { row: number; col: number } | null
  currentDir: Direction
  onSelectCell: CluePanelProps['onSelectCell']
  onClueTextChange: CluePanelProps['onClueTextChange']
}) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selected, currentDir])

  return (
    <div className="space-y-1">
      <h3 className="px-2 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {groups.map((group) => {
        const active = group.clues.some((c) =>
          isClueActive(c, dir, selected, currentDir, gridData, rows, cols),
        )

        return (
          <div
            key={group.label + '-' + dir}
            ref={active ? activeRef : undefined}
            className={
              'group rounded-md px-2 py-1.5 transition-colors' +
              (active ? ' bg-primary/8' : ' hover:bg-muted/50')
            }
          >
            {/* Label */}
            <button
              type="button"
              className="mb-1 text-sm font-bold text-primary hover:underline focus:outline-none"
              onClick={() => onSelectCell(group.clues[0].row, group.clues[0].col, dir)}
            >
              {group.label}
            </button>

            {/* Clue entries within the group */}
            {group.clues.map((clue, idx) => {
              const { display, isComplete } = getWordDisplay(
                gridData,
                clue.row,
                clue.col,
                dir,
                rows,
                cols,
              )

              return (
                <div key={clue.key} className="flex items-center gap-1.5 py-0.5">
                  <Input
                    className="h-7 flex-1 text-xs"
                    value={clue.clue || ''}
                    placeholder={
                      group.clues.length > 1
                        ? `Def. ${idx + 1}...`
                        : 'Definition...'
                    }
                    onChange={(e) =>
                      onClueTextChange({ direction: dir, key: clue.key, text: e.target.value })
                    }
                    onFocus={() => onSelectCell(clue.row, clue.col, dir)}
                  />
                  <span
                    className={
                      'shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs tracking-wider select-none ' +
                      (isComplete
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : 'bg-muted text-muted-foreground')
                    }
                    onClick={() => onSelectCell(clue.row, clue.col, dir)}
                    title={display}
                  >
                    {display}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ========== MAIN COMPONENT ==========

export const CluePanel = memo(function CluePanel({
  clues,
  gridData,
  rows,
  cols,
  selected,
  direction,
  onSelectCell,
  onClueTextChange,
}: CluePanelProps) {
  const acrossGroups = useMemo(() => groupClues(clues.across), [clues.across])
  const downGroups = useMemo(() => groupClues(clues.down), [clues.down])

  return (
    <ScrollArea className="h-full">
      <div className="p-2 pb-8">
        <ClueSection
          title="Horizontalement"
          dir="across"
          groups={acrossGroups}
          gridData={gridData}
          rows={rows}
          cols={cols}
          selected={selected}
          currentDir={direction}
          onSelectCell={onSelectCell}
          onClueTextChange={onClueTextChange}
        />
        <ClueSection
          title="Verticalement"
          dir="down"
          groups={downGroups}
          gridData={gridData}
          rows={rows}
          cols={cols}
          selected={selected}
          currentDir={direction}
          onSelectCell={onSelectCell}
          onClueTextChange={onClueTextChange}
        />
      </div>
    </ScrollArea>
  )
})
