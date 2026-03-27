import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Grid3X3,
  BookOpen,
  Search,
  Library,
  MessageSquare,
  FolderOpen,
  Globe,
  TextQuote,
} from 'lucide-react'
import { useState } from 'react'
import { GridEditorTab } from '@/components/grid-editor/GridEditorTab'
import { PatternSearchTab } from '@/components/pattern-search/PatternSearchTab'
import { GridManagementTab } from '@/components/grid-management/GridManagementTab'
import { SiteManagementTab } from '@/components/site-management/SiteManagementTab'
import { DictEditorTab } from '@/components/dictionary/DictEditorTab'
import { DictManagementTab } from '@/components/dictionary/DictManagementTab'
import { LocutionsTab } from '@/components/locutions/LocutionsTab'
import { MemoTab } from '@/components/memo/MemoTab'

const tabs = [
  { id: 'editor', label: 'Éditeur', icon: Grid3X3 },
  { id: 'dictionary', label: 'Dictionnaire', icon: BookOpen },
  { id: 'dict-management', label: 'Gestion Dicos', icon: Library },
  { id: 'locutions', label: 'Locutions', icon: TextQuote },
  { id: 'pattern', label: 'Recherche', icon: Search },
  { id: 'memo', label: 'Mémos', icon: MessageSquare },
  { id: 'grid-management', label: 'Mes grilles', icon: FolderOpen },
  { id: 'site', label: 'Site joueur', icon: Globe },
] as const

export function AppLayout() {
  const [activeTab, setActiveTab] = useState('editor')

  return (
      <div className="flex h-screen flex-col bg-background">
        {/* Header */}
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <Grid3X3 className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">
              Verbicruciste
            </h1>
          </div>
          <span className="text-xs text-muted-foreground">V2</span>
        </header>

        {/* Main content with tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="border-b bg-muted/30 px-4">
            <TabsList className="h-11 w-full justify-start gap-1 bg-transparent p-0">
              {tabs.map(({ id, label, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="relative gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="editor" className="m-0 h-full">
              <GridEditorTab />
            </TabsContent>
            <TabsContent value="dictionary" className="m-0 h-full">
              <DictEditorTab />
            </TabsContent>
            <TabsContent value="dict-management" className="m-0 h-full">
              <DictManagementTab />
            </TabsContent>
            <TabsContent value="locutions" className="m-0 h-full">
              <LocutionsTab />
            </TabsContent>
            <TabsContent value="pattern" className="m-0 h-full">
              <PatternSearchTab />
            </TabsContent>
            <TabsContent value="memo" className="m-0 h-full">
              <MemoTab />
            </TabsContent>
            <TabsContent value="grid-management" className="m-0 h-full">
              <GridManagementTab />
            </TabsContent>
            <TabsContent value="site" className="m-0 h-full">
              <SiteManagementTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
  )
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mb-2 text-4xl">🚧</div>
        <h2 className="text-lg font-medium">{name}</h2>
        <p className="text-sm text-muted-foreground">
          Migration en cours...
        </p>
      </div>
    </div>
  )
}
