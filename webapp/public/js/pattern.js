/**
 * Onglet Pattern — recherche par pattern (A-Z et ? comme joker).
 */

const PatternSearch = (() => {
  let searchEl, countEl, resultsEl;
  let allSources = [];
  let enabledSources = new Set(); // all enabled by default
  let loaded = false;

  function init() {
    searchEl = document.getElementById('pattern-search');
    countEl = document.getElementById('pattern-count');
    resultsEl = document.getElementById('pattern-results');

    // A-Z et ? uniquement, auto-majuscule
    searchEl.addEventListener('input', () => {
      const cleaned = searchEl.value.toUpperCase().replace(/[^A-Z?/]/g, '');
      if (searchEl.value !== cleaned) searchEl.value = cleaned;
    });

    searchEl.addEventListener('input', debounce(search, 300));
    document.getElementById('btn-pattern-filter').addEventListener('click', showFilterDropdown);
  }

  async function onActivate() {
    if (!loaded) {
      await loadSources();
      loaded = true;
      searchEl.focus();
    }
  }

  async function loadSources() {
    try {
      allSources = await api('/api/pattern/sources');
      enabledSources = new Set(allSources.map(s => s.id));
    } catch (e) {
      console.error('Erreur chargement sources:', e);
    }
  }

  async function search() {
    const pattern = searchEl.value.trim();
    if (!pattern || pattern.length < 2) {
      countEl.textContent = '';
      resultsEl.innerHTML = '';
      return;
    }

    // Validate: must contain at least one letter
    if (!/[A-Z]/.test(pattern) && !/\?/.test(pattern)) {
      countEl.textContent = '';
      resultsEl.innerHTML = '';
      return;
    }

    try {
      const sourcesParam = enabledSources.size < allSources.length
        ? [...enabledSources].join(',')
        : '';
      let url = `/api/pattern/search?pattern=${encodeURIComponent(pattern)}`;
      if (sourcesParam) url += `&sources=${encodeURIComponent(sourcesParam)}`;

      const results = await api(url);
      countEl.textContent = `${results.length} mot${results.length > 1 ? 's' : ''} trouve${results.length > 1 ? 's' : ''}`;

      renderResults(results);
    } catch (e) {
      console.error('Erreur recherche pattern:', e);
      countEl.textContent = 'Erreur';
    }
  }

  function renderResults(results) {
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="pattern-empty">Aucun resultat</div>';
      return;
    }

    const sourceLabels = {};
    for (const s of allSources) sourceLabels[s.id] = s.label;

    let html = '<table class="pattern-table"><thead><tr>';
    html += '<th>Mot</th><th>Source</th><th>Categorie</th><th>Definition</th>';
    html += '</tr></thead><tbody>';

    for (const r of results) {
      const sourceLabel = sourceLabels[r.source] || r.source;
      html += `<tr>
        <td><strong>${escHtml(r.ortho_upper)}</strong></td>
        <td><span class="pattern-source">${escHtml(sourceLabel)}</span></td>
        <td>${escHtml(r.categorie || '')}</td>
        <td>${escHtml(r.definition || r.lemme || '')}</td>
      </tr>`;
    }

    html += '</tbody></table>';
    resultsEl.innerHTML = html;
  }

  function showFilterDropdown(e) {
    e.stopPropagation();
    const existing = document.getElementById('pattern-filter-dropdown');
    if (existing) { existing.remove(); return; }

    const btn = document.getElementById('btn-pattern-filter');
    const rect = btn.getBoundingClientRect();

    const dropdown = document.createElement('div');
    dropdown.id = 'pattern-filter-dropdown';
    dropdown.className = 'filter-dropdown';
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';

    let html = '<div class="filter-dropdown-header">';
    html += '<span>Filtrer les dictionnaires</span>';
    html += '<button class="btn btn-sm" id="pf-toggle-all">Tout cocher</button>';
    html += '</div>';
    html += '<div class="filter-dropdown-list">';

    for (const src of allSources) {
      const checked = enabledSources.has(src.id) ? 'checked' : '';
      html += `<label class="filter-dropdown-item">
        <input type="checkbox" value="${escHtml(src.id)}" ${checked}>
        <span>${escHtml(src.label)}</span>
        <span class="filter-count">${src.count}</span>
      </label>`;
    }

    html += '</div>';
    html += '<div class="filter-dropdown-footer"><button class="btn btn-primary btn-sm" id="pf-apply">Appliquer</button></div>';
    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);

    dropdown.querySelector('#pf-toggle-all').addEventListener('click', () => {
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      const allChecked = [...checkboxes].every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
    });

    dropdown.querySelector('#pf-apply').addEventListener('click', () => {
      enabledSources = new Set();
      dropdown.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        enabledSources.add(cb.value);
      });
      updateFilterButton();
      dropdown.remove();
      if (searchEl.value.trim()) search();
    });

    // Close on outside click
    const closeHandler = (ev) => {
      if (!dropdown.contains(ev.target) && ev.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  function updateFilterButton() {
    const btn = document.getElementById('btn-pattern-filter');
    if (enabledSources.size < allSources.length) {
      btn.textContent = `Filtre dictionnaires (${enabledSources.size}/${allSources.length})`;
      btn.classList.add('btn-primary');
    } else {
      btn.textContent = 'Filtre dictionnaires';
      btn.classList.remove('btn-primary');
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, onActivate };
})();
