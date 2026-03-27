/**
 * Onglet Locutions — recherche paginée, filtre par nature, random, téléchargement.
 */

const Locutions = (() => {
  let searchEl, countEl, tableBody, scrollContainer, loadMoreEl;
  let loaded = false;
  let currentSearch = '';
  let currentOffset = 0;
  let currentTotal = 0;
  let selectedCategories = []; // empty = all
  let allCategories = [];
  let searchInExpression = true;
  let searchInDefinition = false;
  const PAGE_SIZE = 200;

  const CAT_CLASSES = {
    'Loc. nominale': 'cat-nominale',
    'Loc. verbale': 'cat-verbale',
    'Loc. adverbiale': 'cat-adverbiale',
    'Loc. adjectivale': 'cat-adjectivale',
    'Loc. prépositive': 'cat-prepositive',
    'Loc. prépositionnelle': 'cat-prepositive',
    'Loc. interjective': 'cat-interjective',
    'Loc. conjonctive': 'cat-conjonctive',
    'Loc. pronominale': 'cat-verbale',
    'Proverbe': 'cat-proverbe',
    'Idiome': 'cat-proverbe',
    'Expression': 'cat-expression',
    'Expression idiomatique': 'cat-expression',
    'Locution': 'cat-nominale',
    'Nom propre': 'cat-nom-propre',
  };

  function init() {
    searchEl = document.getElementById('locutions-search');
    countEl = document.getElementById('locutions-count');
    tableBody = document.getElementById('locutions-table-body');
    scrollContainer = document.getElementById('locutions-scroll-container');
    loadMoreEl = document.getElementById('locutions-load-more');

    searchEl.addEventListener('input', debounce(() => {
      currentSearch = searchEl.value.trim();
      resetAndLoad();
    }, 300));

    document.getElementById('btn-download-locutions').addEventListener('click', download);
    document.getElementById('btn-random-locutions').addEventListener('click', showRandom);
    document.getElementById('btn-load-more-locutions').addEventListener('click', loadPage);
    document.getElementById('btn-filter-nature').addEventListener('click', showFilterDropdown);
    document.getElementById('btn-help-locutions').addEventListener('click', showHelp);
    document.getElementById('btn-options-locutions').addEventListener('click', showOptions);

    // Infinite scroll
    scrollContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      if (scrollHeight - scrollTop - clientHeight < 100 && currentOffset < currentTotal) {
        loadPage();
      }
    });

    // Close filter dropdown on outside click
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('nature-filter-dropdown');
      if (dropdown && !dropdown.contains(e.target) && e.target.id !== 'btn-filter-nature') {
        dropdown.remove();
      }
      const optDrop = document.getElementById('options-dropdown');
      if (optDrop && !optDrop.contains(e.target) && e.target.id !== 'btn-options-locutions') {
        optDrop.remove();
      }
    });
  }

  async function onActivate() {
    if (!loaded) {
      await loadCategories();
      await loadPage();
      loaded = true;
    }
  }

  async function loadCategories() {
    try {
      allCategories = await api('/api/locutions/categories');
    } catch (e) {
      console.error('Erreur chargement catégories:', e);
    }
  }

  function getSearchInFields() {
    const fields = [];
    if (searchInExpression) fields.push('expression');
    if (searchInDefinition) fields.push('definition');
    if (fields.length === 0) fields.push('expression'); // fallback
    return fields;
  }

  function resetAndLoad() {
    currentOffset = 0;
    tableBody.innerHTML = '';
    loadPage();
  }

  async function loadPage() {
    if (loadMoreEl._loading) return;
    loadMoreEl._loading = true;

    try {
      const params = new URLSearchParams({
        search: currentSearch,
        limit: PAGE_SIZE,
        offset: currentOffset,
        searchIn: getSearchInFields().join(','),
      });
      if (selectedCategories.length > 0) {
        params.set('categories', selectedCategories.join(','));
      }
      const data = await api(`/api/locutions?${params}`);
      currentTotal = data.total;
      currentOffset += data.rows.length;

      const suffix = currentTotal > 1 ? 's' : '';
      const context = currentSearch || selectedCategories.length > 0
        ? `trouvee${suffix}` : 'en base';
      countEl.textContent = `${currentTotal} locution${suffix} ${context}`;

      appendRows(data.rows);

      if (currentOffset < currentTotal) {
        loadMoreEl.style.display = 'block';
      } else {
        loadMoreEl.style.display = 'none';
      }
    } catch (e) {
      console.error('Erreur chargement locutions:', e);
    }

    loadMoreEl._loading = false;
  }

  function appendRows(rows) {
    for (const r of rows) {
      const tr = document.createElement('tr');
      const catClass = CAT_CLASSES[r.categorie] || '';
      tr.innerHTML = `
        <td>${escHtml(r.expression)}</td>
        <td>${catClass ? `<span class="cat-badge ${catClass}">${escHtml(r.categorie)}</span>` : escHtml(r.categorie)}</td>
        <td>${escHtml(r.definition)}</td>
      `;
      tableBody.appendChild(tr);
    }
  }

  function showFilterDropdown(e) {
    e.stopPropagation();
    // Remove existing dropdown
    const existing = document.getElementById('nature-filter-dropdown');
    if (existing) { existing.remove(); return; }

    const btn = document.getElementById('btn-filter-nature');
    const rect = btn.getBoundingClientRect();

    const dropdown = document.createElement('div');
    dropdown.id = 'nature-filter-dropdown';
    dropdown.className = 'filter-dropdown';
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';

    let html = '<div class="filter-dropdown-header">';
    html += '<span>Filtrer par nature</span>';
    html += '<button class="btn btn-sm" id="filter-clear">Tout effacer</button>';
    html += '</div>';
    html += '<div class="filter-dropdown-list">';

    for (const cat of allCategories) {
      const label = cat.categorie || '(sans categorie)';
      const value = cat.categorie;
      const checked = selectedCategories.includes(value) ? 'checked' : '';
      const catClass = CAT_CLASSES[value] || '';
      html += `<label class="filter-dropdown-item">
        <input type="checkbox" value="${escHtml(value)}" ${checked}>
        ${catClass ? `<span class="cat-badge ${catClass}">${escHtml(label)}</span>` : `<span>${escHtml(label)}</span>`}
        <span class="filter-count">${cat.cnt}</span>
      </label>`;
    }

    html += '</div>';
    html += '<div class="filter-dropdown-footer"><button class="btn btn-primary btn-sm" id="filter-apply">Appliquer</button></div>';
    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);

    dropdown.querySelector('#filter-clear').addEventListener('click', () => {
      dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    dropdown.querySelector('#filter-apply').addEventListener('click', () => {
      selectedCategories = [];
      dropdown.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        selectedCategories.push(cb.value);
      });
      updateFilterButton();
      dropdown.remove();
      resetAndLoad();
    });
  }

  function updateFilterButton() {
    const btn = document.getElementById('btn-filter-nature');
    if (selectedCategories.length > 0) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  // ========== OPTIONS ==========

  function showOptions(e) {
    e.stopPropagation();
    const existing = document.getElementById('options-dropdown');
    if (existing) { existing.remove(); return; }

    const btn = document.getElementById('btn-options-locutions');
    const rect = btn.getBoundingClientRect();

    const dropdown = document.createElement('div');
    dropdown.id = 'options-dropdown';
    dropdown.className = 'filter-dropdown';
    dropdown.style.width = 'auto';
    dropdown.style.minWidth = '0';
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    // Align right edge of dropdown with right edge of Options button
    dropdown.style.right = (window.innerWidth - rect.right) + 'px';

    dropdown.innerHTML = `
      <div class="filter-dropdown-header"><span>Rechercher dans</span></div>
      <div class="filter-dropdown-list" style="max-height:none">
        <label class="filter-dropdown-item">
          <input type="checkbox" id="opt-expression" ${searchInExpression ? 'checked' : ''}>
          <span>Expression</span>
        </label>
        <label class="filter-dropdown-item">
          <input type="checkbox" id="opt-definition" ${searchInDefinition ? 'checked' : ''}>
          <span>Definition</span>
        </label>
      </div>
      <div class="filter-dropdown-footer">
        <button class="btn btn-primary btn-sm" id="opt-apply">Appliquer</button>
      </div>
    `;
    document.body.appendChild(dropdown);

    dropdown.querySelector('#opt-apply').addEventListener('click', () => {
      searchInExpression = dropdown.querySelector('#opt-expression').checked;
      searchInDefinition = dropdown.querySelector('#opt-definition').checked;
      if (!searchInExpression && !searchInDefinition) searchInExpression = true;
      dropdown.remove();
      if (currentSearch) resetAndLoad();
    });
  }

  // ========== HELP ==========

  function showHelp() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:550px">
        <h3>Aide — Recherche de locutions</h3>
        <div style="font-size:13px;line-height:1.6">
          <p>Saisissez un ou plusieurs termes. Tous les termes doivent correspondre (logique ET).</p>
          <table class="help-table">
            <thead><tr><th>Syntaxe</th><th>Signification</th><th>Exemple</th></tr></thead>
            <tbody>
              <tr>
                <td><code>MOT</code></td>
                <td>Mot exact</td>
                <td><code>MAIN</code> trouve <em>MAIN FORTE</em> mais pas <em>MAINTENANT</em></td>
              </tr>
              <tr>
                <td><code>MOT/</code></td>
                <td>Commence par</td>
                <td><code>MAIN/</code> trouve <em>MAIN</em>, <em>MAINTENIR</em>, <em>MAINTENANT</em></td>
              </tr>
              <tr>
                <td><code>/MOT</code></td>
                <td>Finit par</td>
                <td><code>/MAIN</code> trouve <em>MAIN</em>, <em>DEMAIN</em></td>
              </tr>
              <tr>
                <td><code>/MOT/</code></td>
                <td>Contient</td>
                <td><code>/MAIN/</code> trouve <em>MAIN</em>, <em>DOMAINE</em>, <em>MAINTIEN</em></td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top:12px"><strong>Recherche multi-termes</strong> : <code>MAIN FER</code> retourne les locutions contenant les deux mots exacts. Les modificateurs s'appliquent independamment a chaque terme.</p>
          <p>Utilisez le bouton <strong>Options</strong> pour choisir de rechercher dans l'expression, la definition, ou les deux.</p>
        </div>
        <div class="modal-actions"><button class="btn" id="help-close">Fermer</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#help-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  async function showRandom() {
    try {
      const results = await api('/api/locutions/random?count=10');

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      let html = '<div class="modal" style="max-width:700px;max-height:80vh;overflow-y:auto;">';
      html += '<h3>10 locutions au hasard</h3>';
      html += '<table class="locutions-table" style="width:100%"><thead><tr><th>Expression</th><th>Nature</th><th>Definition</th></tr></thead><tbody>';
      for (const r of results) {
        const catClass = CAT_CLASSES[r.categorie] || '';
        html += `<tr>
          <td><strong>${escHtml(r.expression)}</strong></td>
          <td>${catClass ? `<span class="cat-badge ${catClass}">${escHtml(r.categorie)}</span>` : escHtml(r.categorie)}</td>
          <td>${escHtml(r.definition)}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      html += '<div class="modal-actions"><button class="btn" id="random-again">Encore !</button><button class="btn" id="random-close">Fermer</button></div>';
      html += '</div>';

      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      overlay.querySelector('#random-close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#random-again').addEventListener('click', async () => {
        const newResults = await api('/api/locutions/random?count=10');
        const tbody = overlay.querySelector('tbody');
        tbody.innerHTML = '';
        for (const r of newResults) {
          const catClass = CAT_CLASSES[r.categorie] || '';
          tbody.innerHTML += `<tr>
            <td><strong>${escHtml(r.expression)}</strong></td>
            <td>${catClass ? `<span class="cat-badge ${catClass}">${escHtml(r.categorie)}</span>` : escHtml(r.categorie)}</td>
            <td>${escHtml(r.definition)}</td>
          </tr>`;
        }
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  async function download() {
    if (!confirm('Telecharger les locutions depuis le Wiktionnaire ? Cela peut prendre plusieurs minutes.')) return;

    const btn = document.getElementById('btn-download-locutions');
    btn.disabled = true;
    btn.textContent = 'Telechargement...';

    try {
      const resp = await fetch('/api/locutions/download', { method: 'POST' });
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              btn.textContent = data.message || 'Telechargement...';
            } catch (e) {}
          }
        }
      }

      btn.textContent = 'Telecharger';
      btn.disabled = false;
      loaded = false;
      await loadCategories();
      resetAndLoad();
    } catch (e) {
      btn.textContent = 'Telecharger';
      btn.disabled = false;
      alert('Erreur : ' + e.message);
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, onActivate };
})();
