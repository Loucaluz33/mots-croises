import { DatabaseProvider, useDatabase } from '@/contexts/DatabaseContext'
import { DatabaseLoader } from '@/components/layout/DatabaseLoader'
import { AppLayout } from '@/components/layout/AppLayout'

function AppContent() {
  const { isLoaded } = useDatabase()
  return isLoaded ? <AppLayout /> : <DatabaseLoader />
}

function App() {
  return (
    <DatabaseProvider>
      <AppContent />
    </DatabaseProvider>
  )
}

export default App
