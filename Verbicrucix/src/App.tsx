import { DatabaseProvider, useDatabase } from '@/contexts/DatabaseContext'
import { AppLayout } from '@/components/layout/AppLayout'

function AppContent() {
  const { isLoaded, isLoading, error } = useDatabase()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Verbicrucix</h1>
          <p className="text-sm text-muted-foreground">Chargement de la base de données...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold">Verbicrucix</h1>
          <p className="text-sm text-destructive">{error}</p>
          <p className="text-xs text-muted-foreground">
            Vérifiez que le fichier verbicrucix.db existe dans le dossier du projet.
          </p>
        </div>
      </div>
    )
  }

  if (!isLoaded) return null

  return <AppLayout />
}

function App() {
  return (
    <DatabaseProvider>
      <AppContent />
    </DatabaseProvider>
  )
}

export default App
