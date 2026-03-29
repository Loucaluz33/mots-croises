import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Filter, Search, Loader2 } from 'lucide-react'
import { patternApi } from '@/api/client'

interface PatternResult {
  mot: string
  source: string
  categorie: string
  definition: string
}

interface SourceInfo {
  name: string
  enabled: boolean
}

export function PatternSearchTab() {
  const [pattern, setPattern] = useState('')
  const [results, setResults] = useState<PatternResult[]>([])
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [sourceFilter, setSourceFilter] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load available sources on mount
  useEffect(() => {
    patternApi.sources().then((res) => {
      const list = (res.sources as Array<{ name: string; enabled: boolean }>).map((s) => ({
        name: s.name,
        enabled: s.enabled ?? true,
      }))
      setSources(list)
      const initial: Record<string, boolean> = {}
      list.forEach((s) => {
        initial[s.name] = true
      })
      setSourceFilter(initial)
    }).catch(() => {
      // Sources will be empty, filters won't show
    })
  }, [])

  const isValidPattern = useCallback((p: string): boolean => {
    if (p.length < 2) return false
    // Must have at least one letter (not just wildcards)
    return /[A-Z]/.test(p.toUpperCase())
  }, [])

  const doSearch = useCallback(async (p: string, filters: Record<string, boolean>) => {
    if (!isValidPattern(p)) {
      setResults([])
      return
    }

    const activeSources = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k]) => k)

    if (activeSources.length === 0) {
      setResults([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await patternApi.search(p.toUpperCase(), activeSources.join(','))
      setResults(res.results as PatternResult[])
    } catch (e) {
      setError((e as Error).message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [isValidPattern])

  // Debounced search on pattern or filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(pattern, sourceFilter)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [pattern, sourceFilter, doSearch])

  const handlePatternChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
      .toUpperCase()
      .replace(/[^A-Z?]/g, '')
    setPattern(val)
  }

  const toggleSource = (name: string) => {
    setSourceFilter((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const toggleAll = () => {
    const allEnabled = Object.values(sourceFilter).every(Boolean)
    const next: Record<string, boolean> = {}
    Object.keys(sourceFilter).forEach((k) => {
      next[k] = !allEnabled
    })
    setSourceFilter(next)
  }

  const activeFilterCount = Object.values(sourceFilter).filter(Boolean).length
  const totalSources = Object.keys(sourceFilter).length

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Motif (A-Z et ? pour joker)..."
            value={pattern}
            onChange={handlePatternChange}
            className="pl-9 font-mono text-lg tracking-widest uppercase"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-4 w-4" />
              Sources
              {activeFilterCount < totalSources && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[1.25rem] px-1 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuCheckboxItem
              checked={activeFilterCount === totalSources}
              onCheckedChange={toggleAll}
            >
              Tout sélectionner
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {sources.map((s) => (
              <DropdownMenuCheckboxItem
                key={s.name}
                checked={sourceFilter[s.name] ?? false}
                onCheckedChange={() => toggleSource(s.name)}
              >
                {s.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!loading && pattern.length > 0 && isValidPattern(pattern) && (
          <span>
            {results.length} résultat{results.length !== 1 ? 's' : ''}
          </span>
        )}
        {!loading && pattern.length > 0 && !isValidPattern(pattern) && (
          <span>Saisissez au moins 2 caractères dont une lettre</span>
        )}
        {error && <span className="text-destructive">{error}</span>}
      </div>

      {/* Results table */}
      <ScrollArea className="flex-1">
        {results.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Mot</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Définition</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={`${r.mot}-${r.source}-${i}`}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <td className="px-3 py-2 font-mono font-semibold tracking-wider">
                    {r.mot}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">
                      {r.source}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.categorie || '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-md">
                    {r.definition || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading &&
          pattern.length === 0 && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Search className="mx-auto mb-2 h-10 w-10 opacity-20" />
                <p>Recherchez un motif avec des jokers (?)</p>
                <p className="text-xs mt-1">Exemple : A??E pour les mots de 4 lettres commençant par A et finissant par E</p>
              </div>
            </div>
          )
        )}
      </ScrollArea>
    </div>
  )
}
