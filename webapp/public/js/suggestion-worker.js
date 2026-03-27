/**
 * Web Worker pour le chargement asynchrone des suggestions.
 * Deux phases : active sources → remaining sources.
 */

let currentController = null;

self.onmessage = async function(e) {
  const { type, generation, pattern, validLengths, activeSources, remainingSources } = e.data;

  if (type === 'cancel') {
    if (currentController) currentController.abort();
    return;
  }

  if (type !== 'search') return;

  // Annuler la requête précédente
  if (currentController) currentController.abort();
  currentController = new AbortController();
  const signal = currentController.signal;

  // Utiliser validLengths (triées de la plus grande à la plus petite)
  const lengths = [...validLengths].sort((a, b) => b - a);
  const allGrouped = {};

  try {
    // Phase 1 : sources actives
    for (const len of lengths) {
      if (signal.aborted) return;
      const subPattern = pattern.slice(0, len);
      const sourcesParam = activeSources.join(',');
      try {
        const resp = await fetch(
          `/api/suggestions/search?pattern=${encodeURIComponent(subPattern)}&sources=${encodeURIComponent(sourcesParam)}`,
          { signal }
        );
        if (signal.aborted) return;
        const data = await resp.json();
        allGrouped[len] = data;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    if (signal.aborted) return;
    self.postMessage({ type: 'phase1', generation, allGrouped });

    // Phase 2 : sources restantes
    if (remainingSources.length > 0) {
      for (const len of lengths) {
        if (signal.aborted) return;
        const subPattern = pattern.slice(0, len);
        const sourcesParam = remainingSources.join(',');
        try {
          const resp = await fetch(
            `/api/suggestions/search?pattern=${encodeURIComponent(subPattern)}&sources=${encodeURIComponent(sourcesParam)}`,
            { signal }
          );
          if (signal.aborted) return;
          const data = await resp.json();
          self.postMessage({ type: 'phase2result', generation, length: len, grouped: data });
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
    }

    if (signal.aborted) return;
    self.postMessage({ type: 'phase2done', generation });

  } catch (err) {
    if (err.name !== 'AbortError') {
      self.postMessage({ type: 'error', generation, message: err.message });
    }
  }
};
