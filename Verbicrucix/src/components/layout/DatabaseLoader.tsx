import { useRef } from 'react'
import { useDatabase } from '@/contexts/DatabaseContext'
import { Button } from '@/components/ui/button'

export function DatabaseLoader() {
  const { isLoading, error, loadFromFile, createNew } = useDatabase()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await loadFromFile(file)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-lg">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Verbicrucix</h1>
          <p className="text-sm text-muted-foreground">
            Chargez votre base de données pour commencer, ou créez-en une nouvelle.
          </p>
        </div>

        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            onChange={handleFileChange}
            className="hidden"
          />

          <Button
            className="w-full"
            size="lg"
            onClick={() => fileRef.current?.click()}
            disabled={isLoading}
          >
            {isLoading ? 'Chargement...' : 'Ouvrir une base de données (.db)'}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={createNew}
            disabled={isLoading}
          >
            Créer une nouvelle base vide
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Le fichier est chargé localement dans votre navigateur. Aucun serveur requis.
        </p>
      </div>
    </div>
  )
}
