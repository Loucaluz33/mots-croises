import { useRef, useEffect, useCallback, useState } from 'react'
import type { SearchResult } from '@/db/queries'

type GroupedResults = Record<string, SearchResult[]>
export type SearchResults = Record<number, GroupedResults>

export interface StreamCallbacks {
  /** Called once with the initial batch (capped, fast) */
  onInitial: (results: SearchResults) => void
  /** Called for each overflow chunk (streaming) */
  onChunk: (len: number, grouped: GroupedResults) => void
  /** Called when all results (initial + overflow) are done */
  onDone: () => void
}

export interface StreamHandle {
  cancel: () => void
}

interface PendingStream {
  callbacks: StreamCallbacks
  cancelled: boolean
  gotInitial: boolean
}

export function useSearchWorker() {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)
  const pendingRef = useRef<Map<number, PendingStream>>(new Map())
  const nextIdRef = useRef(0)

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/search-worker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e: MessageEvent) => {
      const { type, id } = e.data

      if (type === 'ready') {
        setReady(true)
        return
      }

      // Initial batch (capped results, sent immediately)
      if (type === 'search-result') {
        const pending = pendingRef.current.get(id)
        if (pending && !pending.cancelled) {
          pending.gotInitial = true
          pending.callbacks.onInitial(e.data.results)
        }
        return
      }

      // Overflow streaming chunk
      if (type === 'search-chunk') {
        const pending = pendingRef.current.get(id)
        if (pending && !pending.cancelled) {
          pending.callbacks.onChunk(e.data.len, e.data.grouped)
        }
        return
      }

      // All done (initial + overflow complete)
      if (type === 'search-done') {
        const pending = pendingRef.current.get(id)
        if (pending && !pending.cancelled) {
          pending.callbacks.onDone()
        }
        pendingRef.current.delete(id)
        return
      }
    }

    workerRef.current = worker
    return () => { worker.terminate() }
  }, [])

  const streamSearch = useCallback((
    pattern: string,
    validLengths: number[],
    sources: string[] | null,
    callbacks: StreamCallbacks
  ): StreamHandle => {
    if (!workerRef.current || !ready) {
      callbacks.onDone()
      return { cancel: () => {} }
    }
    const id = nextIdRef.current++
    const pending: PendingStream = { callbacks, cancelled: false, gotInitial: false }
    pendingRef.current.set(id, pending)
    workerRef.current.postMessage({ type: 'search', id, pattern, validLengths, sources })
    return {
      cancel: () => {
        pending.cancelled = true
        pendingRef.current.delete(id)
      }
    }
  }, [ready])

  const invalidateCache = useCallback(() => {
    workerRef.current?.postMessage({ type: 'invalidate-cache', id: -1 })
  }, [])

  return { ready, streamSearch, invalidateCache }
}
