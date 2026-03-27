import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { dictionariesApi, dictManagementApi } from '@/api/client'
import {
  BookOpen,
  Globe,
  FolderOpen,
  Plus,
  ToggleLeft,
  ToggleRight,
  Download,
  RefreshCw,
} from 'lucide-react'

// ========== TYPES ==========

interface DictSetting {
  source: string
  name: string
  description?: string
  type: 'personal' | 'external'
  enabled: boolean
  word_count?: number
}

interface DictStat {
  source: string
  name: string
  word_count: number
}

interface FilterGroup {
  id: number
  name: string
  sources: string[]
}

// ========== COMPONENT ==========

export function DictManagementTab() {
  const [settings, setSettings] = useState<DictSetting[]>([])
  const [stats, setStats] = useState<DictStat[]>([])
  const [groups, setGroups] = useState<FilterGroup[]>([])
  const [loading, setLoading] = useState(true)

  // Create dictionary dialog
  const [createDictOpen, setCreateDictOpen] = useState(false)
  const [newDictName, setNewDictName] = useState('')

  // Create group dialog
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // --- Load all data ---
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, statsRes, groupsRes] = await Promise.all([
        dictManagementApi.settings(),
        dictManagementApi.stats(),
        dictManagementApi.groups(),
      ])
      setSettings(settingsRes.settings as DictSetting[])
      setStats(statsRes.stats as DictStat[])
      setGroups(groupsRes.groups as FilterGroup[])
    } catch (e) {
      console.error('Failed to load dict management data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --- Toggle source ---
  const handleToggle = useCallback(async (source: string, enabled: boolean) => {
    try {
      await dictManagementApi.toggleSource(source, !enabled)
      setSettings((prev) =>
        prev.map((s) => (s.source === source ? { ...s, enabled: !enabled } : s))
      )
    } catch (e) {
      console.error('Toggle failed:', e)
    }
  }, [])

  // --- Create dictionary ---
  const handleCreateDict = useCallback(async () => {
    if (!newDictName.trim()) return
    try {
      await dictionariesApi.create(newDictName.trim())
      setCreateDictOpen(false)
      setNewDictName('')
      loadData()
    } catch (e) {
      console.error('Create dict failed:', e)
    }
  }, [newDictName, loadData])

  // --- Create group ---
  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return
    try {
      await dictManagementApi.createGroup(newGroupName.trim())
      setCreateGroupOpen(false)
      setNewGroupName('')
      loadData()
    } catch (e) {
      console.error('Create group failed:', e)
    }
  }, [newGroupName, loadData])

  // --- Helpers ---
  const getWordCount = useCallback(
    (source: string) => {
      const stat = stats.find((s) => s.source === source)
      return stat?.word_count ?? 0
    },
    [stats]
  )

  const personalDicts = settings.filter((s) => s.type === 'personal')
  const externalDicts = settings.filter((s) => s.type === 'external')

  // ========== RENDER ==========

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Chargement...</span>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl space-y-8">
        {/* ========== Personal Dictionaries ========== */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Dictionnaires personnels</h2>
            </div>
            <Button size="sm" onClick={() => setCreateDictOpen(true)}>
              <Plus className="h-4 w-4" data-icon="inline-start" />
              Nouveau
            </Button>
          </div>

          {personalDicts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Aucun dictionnaire personnel. Cliquez sur &laquo; Nouveau &raquo; pour en creer un.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {personalDicts.map((d) => (
                <DictCard
                  key={d.source}
                  name={d.name}
                  description={`${getWordCount(d.source).toLocaleString('fr-FR')} mots`}
                  enabled={d.enabled}
                  onToggle={() => handleToggle(d.source, d.enabled)}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ========== External Dictionaries ========== */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Dictionnaires externes</h2>
          </div>

          {externalDicts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Aucun dictionnaire externe disponible.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {externalDicts.map((d) => (
                <DictCard
                  key={d.source}
                  name={d.name}
                  description={d.description || `${getWordCount(d.source).toLocaleString('fr-FR')} mots`}
                  wordCount={getWordCount(d.source)}
                  enabled={d.enabled}
                  showDownload
                  onToggle={() => handleToggle(d.source, d.enabled)}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ========== Filter Groups ========== */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Groupes de filtres</h2>
            </div>
            <Button size="sm" onClick={() => setCreateGroupOpen(true)}>
              <Plus className="h-4 w-4" data-icon="inline-start" />
              Nouveau groupe
            </Button>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Aucun groupe de filtres. Creez-en un pour organiser vos sources.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
                >
                  <h3 className="font-medium text-sm mb-2">{g.name}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {g.sources.length > 0 ? (
                      g.sources.map((src) => (
                        <Badge key={src} variant="secondary" className="text-xs">
                          {src}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Aucune source</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ========== Create Dict Dialog ========== */}
      <Dialog open={createDictOpen} onOpenChange={setCreateDictOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau dictionnaire</DialogTitle>
            <DialogDescription>
              Donnez un nom a votre nouveau dictionnaire personnel.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="new-dict-name">Nom</Label>
            <Input
              id="new-dict-name"
              value={newDictName}
              onChange={(e) => setNewDictName(e.target.value)}
              placeholder="Mon dictionnaire"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDict()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDictOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateDict} disabled={!newDictName.trim()}>
              Creer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Create Group Dialog ========== */}
      <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau groupe de filtres</DialogTitle>
            <DialogDescription>
              Creez un groupe pour organiser vos sources de mots.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="new-group-name">Nom du groupe</Label>
            <Input
              id="new-group-name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Groupe de filtres"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              Creer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}

// ========== DictCard sub-component ==========

function DictCard({
  name,
  description,
  wordCount,
  enabled,
  showDownload,
  onToggle,
}: {
  name: string
  description: string
  wordCount?: number
  enabled: boolean
  showDownload?: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-colors ${
        enabled ? 'hover:bg-muted/30' : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm truncate">{name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          {wordCount !== undefined && (
            <Badge variant="secondary" className="text-xs mt-2">
              {wordCount.toLocaleString('fr-FR')} mots
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showDownload && (
            <Button variant="ghost" size="icon-xs" title="Telecharger">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <button
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={enabled ? 'Desactiver' : 'Activer'}
          >
            {enabled ? (
              <ToggleRight className="h-6 w-6 text-primary" />
            ) : (
              <ToggleLeft className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
