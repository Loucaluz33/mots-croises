import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { locutionsApi } from '@/api/client'
import { Search, Filter, TextQuote, ChevronDown } from 'lucide-react'

// ========== TYPES ==========

interface Locution {
  id: number
  expression: string
  categorie: string
  definition: string
}

const PAGE_SIZE = 50

// ========== COMPONENT ==========

export function LocutionsTab() {
  const [locutions, setLocutions] = useState<Locution[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Category filter
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // --- Debounce search ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0)
      setLocutions([])
      setHasMore(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset on category change
  useEffect(() => {
    setOffset(0)
    setLocutions([])
    setHasMore(true)
  }, [selectedCategories])

  // --- Build query params ---
  const buildParams = useCallback(
    (currentOffset: number) => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (selectedCategories.size > 0) {
        params.set('categories', Array.from(selectedCategories).join(','))
      }
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(currentOffset))
      return params.toString()
    },
    [debouncedSearch, selectedCategories]
  )

  // --- Load locutions ---
  const loadLocutions = useCallback(
    async (append = false) => {
      setLoading(true)
      try {
        const currentOffset = append ? offset : 0
        const res = await locutionsApi.search(buildParams(currentOffset))
        const items = res.locutions as (Locution & { total_count?: number })[]

        if (append) {
          setLocutions((prev) => [...prev, ...items])
        } else {
          setLocutions(items)
        }

        // Extract categories from first load
        if (!append && items.length > 0) {
          const cats = new Set<string>()
          items.forEach((l) => {
            if (l.categorie) cats.add(l.categorie)
          })
          setCategories((prev) => {
            const merged = new Set([...prev, ...cats])
            return Array.from(merged).sort()
          })
        }

        // Check total count if returned
        if (items.length > 0 && items[0].total_count !== undefined) {
          setTotalCount(items[0].total_count)
        }

        setHasMore(items.length >= PAGE_SIZE)
        if (!append) {
          setOffset(items.length)
        } else {
          setOffset(currentOffset + items.length)
        }
      } catch (e) {
        console.error('Failed to load locutions:', e)
      } finally {
        setLoading(false)
      }
    },
    [buildParams, offset]
  )

  // Initial load and on search/category change
  useEffect(() => {
    loadLocutions(false)
  }, [debouncedSearch, selectedCategories])

  // --- Infinite scroll via IntersectionObserver ---
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadLocutions(true)
        }
      },
      { threshold: 0.1 }
    )

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => observerRef.current?.disconnect()
  }, [hasMore, loading, loadLocutions])

  // --- Toggle category ---
  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }, [])

  // ========== RENDER ==========

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TextQuote className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Locutions</h2>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une locution..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Filter className="h-4 w-4" />
            Categories
            {selectedCategories.size > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {selectedCategories.size}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 ml-0.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
            {categories.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Aucune categorie
              </div>
            ) : (
              categories.map((cat) => (
                <DropdownMenuCheckboxItem
                  key={cat}
                  checked={selectedCategories.has(cat)}
                  onClick={() => toggleCategory(cat)}
                  closeOnClick={false}
                >
                  {cat}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results count */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {locutions.length} affichee{locutions.length !== 1 ? 's' : ''}
          {totalCount > 0 && ` / ${totalCount.toLocaleString('fr-FR')} total`}
        </Badge>
        {selectedCategories.size > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSelectedCategories(new Set())}
            className="text-xs text-muted-foreground"
          >
            Effacer les filtres
          </Button>
        )}
        {loading && (
          <span className="text-xs text-muted-foreground animate-pulse">Chargement...</span>
        )}
      </div>

      {/* Results table */}
      <ScrollArea className="flex-1 rounded-lg border" ref={scrollRef}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Expression</th>
              <th className="px-3 py-2 text-left font-medium w-32">Categorie</th>
              <th className="px-3 py-2 text-left font-medium">Definition</th>
            </tr>
          </thead>
          <tbody>
            {locutions.map((l, i) => (
              <tr
                key={`${l.id}-${i}`}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <td className="px-3 py-2 font-medium">{l.expression}</td>
                <td className="px-3 py-2">
                  {l.categorie ? (
                    <Badge variant="outline" className="text-xs">
                      {l.categorie}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{l.definition || '—'}</td>
              </tr>
            ))}
            {locutions.length === 0 && !loading && (
              <tr>
                <td colSpan={3} className="py-12 text-center text-muted-foreground">
                  Aucune locution trouvee.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {loading ? (
              <span className="text-xs text-muted-foreground animate-pulse">
                Chargement...
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadLocutions(true)}
                className="text-xs text-muted-foreground"
              >
                Charger plus
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
