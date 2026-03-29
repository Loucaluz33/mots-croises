/**
 * Panneau de suggestions — filtres par groupe, deux phases, colonnes par longueur.
 * Port fidèle de suggestion-panel.js + suggestion-worker.js de la V1.
 *
 * Différence V2 : pas de Web Worker car sql.js tourne en mémoire côté main thread.
 * Les queries sont rapides (<50ms) donc pas de jank. On utilise un système de
 * génération pour annuler les recherches périmées et setTimeout pour la phase 2
 * (non-bloquant grâce au découpage en micro-tâches).
 */
import { useState, useEffect, useCallback, useRef, useMemo, memo, type UIEvent } from 'react'
import { getDictGroups, type SearchResult } from '@/db/queries'
import type { GridCell, Direction } from '@/types/grid'
import { getCellsFromSelected } from '@/lib/grid-utils'
import { cn } from '@/lib/utils'
import { useSearchWorker } from '@/hooks/useSearchWorker'

// ========== TYPES ==========

interface DictGroup {
  id: number
  name: string
  sources: string[]
}

interface SuggestionPanelProps {
  gridData: GridCell[][]
  rows: number
  cols: number
  selected: [number, number] | null
  direction: Direction
  onPreviewWord: (word: string) => void
  onClearPreview: () => void
  onLockPreview: (word: string) => void
  onUnlockPreview: () => void
  onInsertWord: (word: string) => void
}

// ========== FORMAT HELPERS ==========

function formatCount(n: number): string {
  if (n < 10000) return String(n)
  if (n < 100000) return (n / 1000).toFixed(1).replace('.', ',') + 'k'
  if (n < 1000000) return Math.round(n / 1000) + 'k'
  if (n < 10000000) return (n / 1000000).toFixed(2).replace('.', ',') + 'm'
  if (n < 100000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'm'
  if (n < 1000000000) return Math.round(n / 1000000) + 'm'
  return (n / 1000000000).toFixed(2).replace('.', ',') + 'M'
}

// ========== COMPONENT ==========

export const SuggestionPanel = memo(function SuggestionPanel({
  gridData, rows, cols, selected, direction,
  onPreviewWord, onClearPreview, onLockPreview, onUnlockPreview, onInsertWord,
}: SuggestionPanelProps) {

  const { ready: workerReady, streamSearch } = useSearchWorker()
  const workerReadyRef = useRef(false)
  workerReadyRef.current = workerReady

  // Combine search-related state into a single object to avoid cascading re-renders
  interface SearchState {
    allResults: Record<number, Record<string, SearchResult[]>>
    bgResults: Record<number, Record<string, SearchResult[]>>
    phase: 'idle' | 'phase1' | 'phase2' | 'done'
  }
  const [groups, setGroups] = useState<DictGroup[]>([])
  const [activeGroupIds, setActiveGroupIds] = useState<Set<number>>(new Set())
  const [searchState, setSearchState] = useState<SearchState>({
    allResults: {},
    bgResults: {},
    phase: 'idle',
  })
  const { allResults, bgResults, phase } = searchState

  const generationRef = useRef(0)

  // Load groups on mount
  useEffect(() => {
    try {
      const g = getDictGroups()
      setGroups(g)
      if (g.length > 0) {
        setActiveGroupIds(new Set([g[0].id]))
      }
    } catch {
      // DB may not be ready yet
    }
  }, [])

  // ========== SOURCE HELPERS ==========

  const activeSources = useMemo(() => {
    const sources = new Set<string>()
    for (const group of groups) {
      if (activeGroupIds.has(group.id)) {
        for (const src of group.sources) sources.add(src)
      }
    }
    return [...sources]
  }, [groups, activeGroupIds])

  const remainingSources = useMemo(() => {
    const active = new Set(activeSources)
    const all = new Set<string>()
    for (const group of groups) {
      for (const src of group.sources) all.add(src)
    }
    return [...all].filter(s => !active.has(s))
  }, [groups, activeSources])

  // ========== STABLE PATTERN DERIVATION ==========

  // Derive the search pattern from grid state — memoized to avoid re-triggering searches
  // when gridData changes but the pattern stays the same
  const searchInfo = useMemo(() => {
    if (!selected) return null
    const [r, c] = selected
    if (gridData[r][c].black) return null

    const cells = getCellsFromSelected(gridData, r, c, direction, rows, cols)
    if (cells.length < 2) return null

    const pattern = cells.map(([cr, cc]) => {
      const letter = gridData[cr][cc].letter
      return letter ? letter.toUpperCase() : '?'
    }).join('')

    const maxLen = cells.length
    const validLengths: number[] = []
    for (let len = 2; len <= maxLen; len++) {
      if (len === maxLen) {
        validLengths.push(len)
      } else {
        const [cr, cc] = cells[len]
        const cell = gridData[cr][cc]
        if (!cell.letter) {
          validLengths.push(len)
        }
      }
    }

    if (validLengths.length === 0) return null
    return { pattern, validLengths }
  }, [selected, direction, gridData, rows, cols])

  // Stable string key so the effect only fires when the actual pattern changes
  const searchKey = searchInfo ? `${searchInfo.pattern}|${searchInfo.validLengths.join(',')}` : null

  // When worker becomes ready, trigger a re-search if we have a pending pattern
  const prevWorkerReady = useRef(false)
  const workerJustBecameReady = workerReady && !prevWorkerReady.current
  prevWorkerReady.current = workerReady

  // ========== SEARCH TRIGGER ==========

  // Mutable accumulator for overflow chunks — O(1) push, flushed to state once per rAF
  const allAccRef = useRef<Record<number, Record<string, SearchResult[]>>>({})
  const bgAccRef = useRef<Record<number, Record<string, SearchResult[]>>>({})
  const flushRafRef = useRef<number | null>(null)
  const dirtyRef = useRef<'p1' | 'p2' | 'both' | null>(null)

  const pushToAcc = useCallback((
    acc: Record<number, Record<string, SearchResult[]>>,
    len: number,
    grouped: Record<string, SearchResult[]>
  ) => {
    if (!acc[len]) acc[len] = {}
    for (const [src, items] of Object.entries(grouped)) {
      if (!acc[len][src]) acc[len][src] = []
      for (const item of items) acc[len][src].push(item)
    }
  }, [])

  const flushToState = useCallback(() => {
    flushRafRef.current = null
    const dirty = dirtyRef.current
    if (!dirty) return
    dirtyRef.current = null
    setSearchState(prev => ({
      ...prev,
      allResults: (dirty === 'p1' || dirty === 'both')
        ? { ...allAccRef.current }
        : prev.allResults,
      bgResults: (dirty === 'p2' || dirty === 'both')
        ? { ...bgAccRef.current }
        : prev.bgResults,
    }))
  }, [])

  const scheduleFlush = useCallback((phase: 'p1' | 'p2') => {
    dirtyRef.current = dirtyRef.current && dirtyRef.current !== phase ? 'both' : phase
    if (flushRafRef.current === null) {
      flushRafRef.current = requestAnimationFrame(flushToState)
    }
  }, [flushToState])

  useEffect(() => {
    if (!searchInfo || !workerReadyRef.current) {
      generationRef.current++
      allAccRef.current = {}
      bgAccRef.current = {}
      setSearchState({ allResults: {}, bgResults: {}, phase: 'idle' })
      return
    }

    const { pattern, validLengths } = searchInfo

    generationRef.current++
    allAccRef.current = {}
    bgAccRef.current = {}
    setSearchState({ allResults: {}, bgResults: {}, phase: 'phase1' })
    onUnlockPreview()

    const srcList = activeSources.length > 0 ? activeSources : null

    // Phase 1: active sources
    // - onInitial: first 200 per source/length (instant, fills viewport)
    // - onChunk: overflow items (streamed after 300ms delay, paced)
    const handle1 = streamSearch(pattern, validLengths, srcList, {
      onInitial: (results) => {
        // Set initial results as base + copy into accumulator
        allAccRef.current = {}
        for (const [len, grouped] of Object.entries(results)) {
          allAccRef.current[Number(len)] = {}
          for (const [src, items] of Object.entries(grouped)) {
            allAccRef.current[Number(len)][src] = [...items]
          }
        }
        setSearchState(prev => ({ ...prev, allResults: results }))
      },
      onChunk: (len, grouped) => {
        pushToAcc(allAccRef.current, len, grouped)
        scheduleFlush('p1')
      },
      onDone: () => {
        // Final flush
        if (flushRafRef.current !== null) cancelAnimationFrame(flushRafRef.current)
        flushRafRef.current = null
        dirtyRef.current = null
        setSearchState(prev => ({ ...prev, allResults: { ...allAccRef.current } }))

        // Phase 2: remaining sources
        if (remainingSources.length > 0) {
          setSearchState(prev => ({ ...prev, phase: 'phase2' }))
          handle2 = streamSearch(pattern, validLengths, remainingSources, {
            onInitial: (results) => {
              bgAccRef.current = {}
              for (const [len, grouped] of Object.entries(results)) {
                bgAccRef.current[Number(len)] = {}
                for (const [src, items] of Object.entries(grouped)) {
                  bgAccRef.current[Number(len)][src] = [...items]
                }
              }
              setSearchState(prev => ({ ...prev, bgResults: results }))
            },
            onChunk: (len, grouped) => {
              pushToAcc(bgAccRef.current, len, grouped)
              scheduleFlush('p2')
            },
            onDone: () => {
              if (flushRafRef.current !== null) cancelAnimationFrame(flushRafRef.current)
              flushRafRef.current = null
              dirtyRef.current = null
              setSearchState(prev => ({
                ...prev,
                bgResults: { ...bgAccRef.current },
                phase: 'done',
              }))
            },
          })
        } else {
          setSearchState(prev => ({ ...prev, phase: 'done' }))
        }
      },
    })

    let handle2: { cancel: () => void } | null = null

    return () => {
      handle1.cancel()
      handle2?.cancel()
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current)
        flushRafRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, activeSources, remainingSources, workerReady])

  // ========== COUNT BY SOURCE (for LEDs) ==========

  const countBySource = useMemo(() => {
    const counts: Record<string, number> = {}
    // Phase 1
    for (const grouped of Object.values(allResults)) {
      for (const [src, results] of Object.entries(grouped)) {
        counts[src] = (counts[src] || 0) + results.length
      }
    }
    // Phase 2
    for (const grouped of Object.values(bgResults)) {
      for (const [src, results] of Object.entries(grouped)) {
        counts[src] = (counts[src] || 0) + results.length
      }
    }
    return counts
  }, [allResults, bgResults])

  // ========== DISPLAY DATA ==========

  const { columns, computedTotalCount } = useMemo(() => {
    const activeSourceSet = new Set(activeSources)
    const lengths = Object.keys(allResults).map(Number).sort((a, b) => b - a)
    const cols: { len: number; personal: SearchResult[]; general: SearchResult[] }[] = []
    let count = 0

    for (const len of lengths) {
      const grouped = allResults[len]
      if (!grouped) continue

      const personal: SearchResult[] = []
      const general: SearchResult[] = []

      for (const [src, results] of Object.entries(grouped)) {
        if (!activeSourceSet.has(src)) continue
        for (const r of results) {
          if (src.startsWith('personnel_')) {
            personal.push(r)
          } else {
            general.push(r)
          }
        }
      }

      if (personal.length === 0 && general.length === 0) continue
      cols.push({ len, personal, general })
      count += personal.length + general.length
    }

    return { columns: cols, computedTotalCount: count }
  }, [allResults, activeSources])

  // ========== GROUP HANDLERS ==========

  const handleGroupClick = useCallback((groupId: number) => {
    setActiveGroupIds(new Set([groupId]))
  }, [])

  const selectAllGroups = useCallback(() => {
    setActiveGroupIds(new Set(groups.map(g => g.id)))
  }, [groups])

  const resetGroups = useCallback(() => {
    if (groups.length > 0) {
      setActiveGroupIds(new Set([groups[0].id]))
    }
  }, [groups])

  // ========== WORD HANDLERS ==========

  const [selectedWord, setSelectedWord] = useState<string | null>(null)

  const handleWordClick = useCallback((word: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedWord(word)
    onLockPreview(word)
  }, [onLockPreview])

  const handleWordDoubleClick = useCallback((word: string) => {
    onInsertWord(word)
    setSelectedWord(null)
  }, [onInsertWord])

  const handleWordMouseEnter = useCallback((word: string) => {
    onPreviewWord(word)
  }, [onPreviewWord])

  const handleWordMouseLeave = useCallback(() => {
    onClearPreview()
  }, [onClearPreview])

  const handlePanelClick = useCallback(() => {
    setSelectedWord(null)
    onUnlockPreview()
  }, [onUnlockPreview])

  // ========== RENDER ==========

  return (
    <div
      className="flex w-56 shrink-0 flex-col border-l bg-card"
      onClick={handlePanelClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Suggestions</span>
        <div className="flex items-center gap-1.5">
          {/* Global LED */}
          <span className={cn(
            'inline-block h-2.5 w-2.5 rounded-full',
            phase === 'idle' ? 'bg-muted' :
            phase === 'done' ? 'bg-green-500' :
            'bg-amber-500 animate-pulse'
          )} />
          <span className="text-xs text-muted-foreground">{computedTotalCount > 0 ? formatCount(computedTotalCount) : ''}</span>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1 border-b px-2 py-1.5">
        {/* A and R buttons */}
        <button
          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); selectAllGroups() }}
          title="Tout sélectionner"
        >
          A
        </button>
        <button
          className="rounded px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); resetGroups() }}
          title="Réinitialiser"
        >
          R
        </button>

        {/* Group buttons */}
        {groups.map(group => {
          const isActive = activeGroupIds.has(group.id)
          const groupCount = group.sources.reduce((sum, src) => sum + (countBySource[src] || 0), 0)
          const ledColor = phase === 'phase1' ? 'bg-red-500' :
                           groupCount > 0 ? 'bg-green-500' : 'bg-muted'

          return (
            <button
              key={group.id}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
              onClick={(e) => { e.stopPropagation(); handleGroupClick(group.id) }}
            >
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', ledColor)} />
              <span className="truncate max-w-[80px]">{group.name}</span>
              {groupCount > 0 && (
                <span className="ml-0.5 opacity-70">{formatCount(groupCount)}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Results columns — each column scrolls independently for virtual rendering */}
      <div
        className="flex min-h-0 flex-1 gap-0 overflow-x-auto"
        onClick={handlePanelClick}
      >
        {columns.length === 0 && phase !== 'phase1' && (
          <div className="flex flex-1 items-center justify-center p-4">
            <span className="text-xs text-muted-foreground">
              {selected ? 'Aucune suggestion' : 'Sélectionnez une case'}
            </span>
          </div>
        )}

        {columns.map(({ len, personal, general }) => (
          <WordColumn
            key={len}
            len={len}
            personal={personal}
            general={general}
            selectedWord={selectedWord}
            onWordClick={handleWordClick}
            onWordDoubleClick={handleWordDoubleClick}
            onWordMouseEnter={handleWordMouseEnter}
            onWordMouseLeave={handleWordMouseLeave}
          />
        ))}
      </div>
    </div>
  )
})

// ========== VIRTUAL WORD COLUMN ==========

const ITEM_HEIGHT = 22   // px per word row
const OVERSCAN = 15      // extra rows rendered above/below viewport

interface WordColumnProps {
  len: number
  personal: SearchResult[]
  general: SearchResult[]
  selectedWord: string | null
  onWordClick: (word: string, e: React.MouseEvent) => void
  onWordDoubleClick: (word: string) => void
  onWordMouseEnter: (word: string) => void
  onWordMouseLeave: () => void
}

const WordColumn = memo(function WordColumn({
  len, personal, general, selectedWord,
  onWordClick, onWordDoubleClick, onWordMouseEnter, onWordMouseLeave,
}: WordColumnProps) {
  // Merge personal + general into one flat list with a separator index
  const { items, separatorIndex } = useMemo(() => {
    const list: { word: SearchResult; isPersonal: boolean }[] = []
    for (const w of personal) list.push({ word: w, isPersonal: true })
    const sepIdx = personal.length > 0 && general.length > 0 ? personal.length : -1
    for (const w of general) list.push({ word: w, isPersonal: false })
    return { items: list, separatorIndex: sepIdx }
  }, [personal, general])

  const totalItems = items.length
  // Total height accounts for separator (2px)
  const hasSeparator = separatorIndex >= 0
  const totalHeight = totalItems * ITEM_HEIGHT + (hasSeparator ? 2 : 0)

  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset scroll when data changes
  const dataKey = `${personal.length}-${general.length}`
  const prevDataKey = useRef(dataKey)
  if (prevDataKey.current !== dataKey) {
    prevDataKey.current = dataKey
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
  }

  // Measure viewport height on mount / resize
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    setViewportHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Calculate visible range
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(totalItems, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN)

  // Offset for separator: items after separatorIndex are shifted down by 2px
  const topPadding = startIdx * ITEM_HEIGHT + (hasSeparator && startIdx >= separatorIndex ? 2 : 0)
  const bottomPadding = Math.max(0, totalHeight - endIdx * ITEM_HEIGHT - (hasSeparator && endIdx >= separatorIndex ? 2 : 0))

  const visibleItems = items.slice(startIdx, endIdx)

  return (
    <div className="flex min-w-[120px] flex-col border-r last:border-r-0">
      {/* Column header */}
      <div className="shrink-0 border-b bg-muted/50 px-2 py-1 text-center">
        <div className="text-xs font-semibold">{len} lettres</div>
        <div className="text-[10px] text-muted-foreground">
          — {totalItems.toLocaleString('fr-FR')} —
        </div>
      </div>

      {/* Virtualized scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight }}>
          <div style={{ paddingTop: topPadding, paddingBottom: bottomPadding }}>
            {visibleItems.map((item, i) => {
              const globalIdx = startIdx + i
              const showSep = hasSeparator && globalIdx === separatorIndex
              return (
                <div key={globalIdx}>
                  {showSep && <div className="mx-2 border-t border-dashed" style={{ height: 2 }} />}
                  <div
                    className={cn(
                      'cursor-pointer px-2 py-0.5 text-xs select-none transition-colors',
                      item.isPersonal && 'font-semibold text-blue-700 dark:text-blue-400',
                      selectedWord === item.word.ortho_upper
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent',
                    )}
                    style={{ height: ITEM_HEIGHT }}
                    title={item.word.definition || item.word.categorie || ''}
                    onClick={(e) => { e.stopPropagation(); onWordClick(item.word.ortho_upper, e) }}
                    onDoubleClick={() => onWordDoubleClick(item.word.ortho_upper)}
                    onMouseEnter={() => onWordMouseEnter(item.word.ortho_upper)}
                    onMouseLeave={onWordMouseLeave}
                  >
                    {item.word.ortho_upper}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})
