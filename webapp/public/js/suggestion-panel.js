/**
 * Panneau de suggestions — filtres par groupe, deux phases, Web Worker.
 * Port de SuggestionPanel + _SuggestionThread de main.py.
 */

const SuggestionPanel = (() => {
  let worker;
  let generation = 0;
  let groups = [];
  let activeGroupIds = new Set();
  let allResults = {}; // {length: {source: [results]}}
  let bgResults = {};  // résultats phase 2
  let filterBtns = {};
  let globalLed, columnsEl, countEl;

  async function init() {
    columnsEl = document.getElementById('suggestion-columns');
    countEl = document.getElementById('suggestion-count');
    globalLed = document.getElementById('global-led');

    // Boutons spéciaux
    document.getElementById('filter-all').addEventListener('click', selectAllGroups);
    document.getElementById('filter-reset').addEventListener('click', resetGroups);

    // Web Worker
    worker = new Worker('js/suggestion-worker.js');
    worker.onmessage = onWorkerMessage;

    // Clic ailleurs dans le panneau = déverrouiller
    columnsEl.addEventListener('click', (e) => {
      if (!e.target.closest('.suggestion-word')) {
        clearSelection();
        GridEditor.unlockPreview();
      }
    });

    // Charger les groupes (await pour s'assurer qu'ils sont prêts)
    await loadGroups();
  }

  function selectWord(word, el) {
    clearSelection();
    if (el) el.classList.add('selected');
    GridEditor.lockPreview(word);
  }

  function clearSelection() {
    columnsEl.querySelectorAll('.suggestion-word.selected').forEach(e => e.classList.remove('selected'));
  }

  async function loadGroups() {
    try {
      groups = await api('/api/dict-management/groups');
      if (groups.length > 0 && activeGroupIds.size === 0) {
        activeGroupIds.add(groups[0].id);
      }
      renderFilters();
    } catch (e) {
      console.error('Erreur chargement groupes:', e);
    }
  }

  function renderFilters() {
    const container = document.getElementById('suggestion-filters');
    // Garder les boutons spéciaux (global-led, A, R)
    const specialEls = [globalLed, document.getElementById('filter-all'), document.getElementById('filter-reset')];

    // Supprimer les anciens boutons de filtre
    for (const key of Object.keys(filterBtns)) {
      filterBtns[key].remove();
    }
    filterBtns = {};

    for (const group of groups) {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeGroupIds.has(group.id) ? ' active' : '');

      const led = document.createElement('span');
      led.className = 'led off';
      btn.appendChild(led);

      btn.appendChild(document.createTextNode(group.name));

      const countBadge = document.createElement('span');
      countBadge.className = 'count-badge';
      btn.appendChild(countBadge);

      // Clic gauche = sélection exclusive
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        activeGroupIds.clear();
        activeGroupIds.add(group.id);
        updateFilterBtns();
        refreshDisplay();
      });

      // Clic droit = toggle dans la sélection
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (activeGroupIds.has(group.id)) {
          if (activeGroupIds.size > 1) activeGroupIds.delete(group.id);
        } else {
          activeGroupIds.add(group.id);
        }
        updateFilterBtns();
        refreshDisplay();
      });

      filterBtns[group.id] = btn;
      container.appendChild(btn);
    }
  }

  function updateFilterBtns() {
    for (const group of groups) {
      const btn = filterBtns[group.id];
      if (!btn) continue;
      btn.classList.toggle('active', activeGroupIds.has(group.id));
    }
  }

  function selectAllGroups() {
    activeGroupIds = new Set(groups.map(g => g.id));
    updateFilterBtns();
    refreshDisplay();
  }

  function resetGroups() {
    activeGroupIds.clear();
    if (groups.length > 0) activeGroupIds.add(groups[0].id);
    updateFilterBtns();
    refreshDisplay();
  }

  // ========== SOURCES HELPERS ==========

  function getActiveSources() {
    const sources = new Set();
    for (const group of groups) {
      if (activeGroupIds.has(group.id)) {
        for (const src of group.sources) sources.add(src);
      }
    }
    return [...sources];
  }

  function getRemainingSources() {
    const active = new Set(getActiveSources());
    const all = new Set();
    for (const group of groups) {
      for (const src of group.sources) all.add(src);
    }
    return [...all].filter(s => !active.has(s));
  }

  // ========== SEARCH TRIGGER ==========

  function onCellSelected(r, c, dir, gridData, rows, cols) {
    // Déverrouiller si on change de case
    clearSelection();
    GridEditor.unlockPreview();

    // Construire le pattern depuis la cellule sélectionnée vers la droite/bas
    const cells = GridEditor.getCellsFromSelected(r, c, dir);
    if (cells.length < 2) { clear(); return; }

    const pattern = cells.map(([cr, cc]) => {
      const letter = gridData[cr][cc].letter;
      return letter ? letter.toUpperCase() : '?';
    }).join('');

    // Calculer les longueurs valides :
    // Une longueur L est valide ssi la cellule juste après (start+L) est :
    //   - le bord de la grille, OU
    //   - une case noire, OU
    //   - une cellule vide (sans lettre)
    // Si elle contient déjà une lettre, le mot "déborderait" dessus → invalide.
    const maxLen = cells.length;
    const validLengths = [];
    for (let len = 2; len <= maxLen; len++) {
      if (len === maxLen) {
        // Le mot remplit tout le segment jusqu'au bord/case noire → toujours valide
        validLengths.push(len);
      } else {
        // Vérifier la cellule juste après le mot
        const [cr, cc] = cells[len]; // cellule à position start+len
        const cell = gridData[cr][cc];
        if (!cell.letter) {
          // Cellule vide → on pourrait y poser une case noire → valide
          validLengths.push(len);
        }
        // Si la cellule a déjà une lettre → longueur invalide, on skip
      }
    }

    if (validLengths.length === 0) { clear(); return; }

    // Lancer la recherche
    generation++;
    allResults = {};
    bgResults = {};
    globalLed.className = 'global-led loading';

    // Reset LED (rouge = en cours de chargement) et compteurs
    for (const group of groups) {
      const btn = filterBtns[group.id];
      if (!btn) continue;
      const led = btn.querySelector('.led');
      if (led) led.className = 'led red';
      const badge = btn.querySelector('.count-badge');
      if (badge) badge.textContent = '';
    }

    const activeSources = getActiveSources();
    const remainingSources = getRemainingSources();

    worker.postMessage({
      type: 'search',
      generation,
      pattern,
      validLengths,
      activeSources,
      remainingSources,
    });
  }

  function clear() {
    generation++;
    worker.postMessage({ type: 'cancel' });
    allResults = {};
    bgResults = {};
    columnsEl.innerHTML = '';
    countEl.textContent = '';
    globalLed.className = 'global-led loading';
  }

  // ========== WORKER MESSAGES ==========

  function onWorkerMessage(e) {
    const msg = e.data;
    if (msg.generation !== generation) return; // Périmé

    if (msg.type === 'phase1') {
      allResults = msg.allGrouped;
      displayColumns();
    } else if (msg.type === 'phase2result') {
      // Merge into bgResults
      if (!bgResults[msg.length]) bgResults[msg.length] = {};
      for (const [src, results] of Object.entries(msg.grouped)) {
        if (!bgResults[msg.length][src]) bgResults[msg.length][src] = [];
        bgResults[msg.length][src].push(...results);
      }
      updateLeds();
    } else if (msg.type === 'phase2done') {
      globalLed.className = 'global-led done';
    } else if (msg.type === 'error') {
      console.error('Worker error:', msg.message);
      globalLed.className = 'global-led done';
    }
  }

  // ========== DISPLAY ==========

  function displayColumns() {
    columnsEl.innerHTML = '';
    let totalCount = 0;
    const activeSources = new Set(getActiveSources());

    // Trier les longueurs de la plus grande à la plus petite
    const lengths = Object.keys(allResults).map(Number).sort((a, b) => b - a);

    for (const len of lengths) {
      const grouped = allResults[len];
      if (!grouped) continue;

      // Filtrer par sources actives
      const personalWords = [];
      const generalWords = [];

      for (const [src, results] of Object.entries(grouped)) {
        if (!activeSources.has(src)) continue;
        for (const r of results) {
          if (src.startsWith('personnel_')) {
            personalWords.push(r);
          } else {
            generalWords.push(r);
          }
        }
      }

      if (personalWords.length === 0 && generalWords.length === 0) continue;

      const col = document.createElement('div');
      col.className = 'suggestion-col';

      const header = document.createElement('div');
      header.className = 'suggestion-col-header';
      const total = (personalWords.length + generalWords.length).toLocaleString('fr-FR');
      header.innerHTML = `${len} lettres<br>- ${total} -`;
      col.appendChild(header);

      // Mots personnels en premier
      for (const w of personalWords) {
        col.appendChild(createWordEl(w, true));
        totalCount++;
      }

      if (personalWords.length > 0 && generalWords.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'suggestion-word-separator';
        col.appendChild(sep);
      }

      for (const w of generalWords) {
        col.appendChild(createWordEl(w, false));
        totalCount++;
      }

      columnsEl.appendChild(col);
    }

    countEl.textContent = `${totalCount} mots`;
    updateLeds();
  }

  function refreshDisplay() {
    displayColumns();
  }

  function createWordEl(word, isPersonal) {
    const el = document.createElement('div');
    el.className = 'suggestion-word' + (isPersonal ? ' personal' : '');
    el.textContent = word.ortho_upper;
    el.title = word.definition || word.categorie || '';

    // Double-clic = insérer dans la grille
    el.addEventListener('dblclick', () => {
      GridEditor.insertWord(word.ortho_upper);
    });

    // Clic simple = verrouiller la preview
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectWord(word.ortho_upper, el);
    });

    // Preview au survol
    el.addEventListener('mouseenter', () => {
      GridEditor.previewWord(word.ortho_upper);
    });
    el.addEventListener('mouseleave', () => {
      GridEditor.clearPreview();
    });

    return el;
  }

  // ========== LED UPDATES ==========

  // Formate un nombre en 4 caractères max : 1, 11, 111, 1111, 11,1k, 111k, 1,11m, 11,1m, 111m, 1,11M
  function formatCount(n) {
    if (n < 10000) return String(n);
    if (n < 100000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
    if (n < 1000000) return Math.round(n / 1000) + 'k';
    if (n < 10000000) return (n / 1000000).toFixed(2).replace('.', ',') + 'm';
    if (n < 100000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'm';
    if (n < 1000000000) return Math.round(n / 1000000) + 'm';
    return (n / 1000000000).toFixed(2).replace('.', ',') + 'M';
  }

  function updateLeds() {
    // Compter les résultats par source (toutes phases confondues)
    const countBySource = {};

    // Phase 1
    for (const grouped of Object.values(allResults)) {
      for (const [src, results] of Object.entries(grouped)) {
        countBySource[src] = (countBySource[src] || 0) + results.length;
      }
    }

    // Phase 2
    for (const grouped of Object.values(bgResults)) {
      for (const [src, results] of Object.entries(grouped)) {
        countBySource[src] = (countBySource[src] || 0) + results.length;
      }
    }

    // Mettre à jour les LEDs et compteurs par groupe
    for (const group of groups) {
      const btn = filterBtns[group.id];
      if (!btn) continue;

      let groupCount = 0;
      for (const src of group.sources) {
        groupCount += countBySource[src] || 0;
      }

      const led = btn.querySelector('.led');
      if (led) {
        // Vert = chargé avec résultats, éteint = chargé sans résultats
        led.className = groupCount > 0 ? 'led green' : 'led off';
      }
      const badge = btn.querySelector('.count-badge');
      if (badge) {
        badge.textContent = groupCount > 0 ? formatCount(groupCount) : '';
      }
    }
  }

  return {
    init,
    onCellSelected,
    clear,
    loadGroups,
    selectWord,
    clearSelection,
  };
})();
