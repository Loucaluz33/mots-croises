/**
 * Éditeur de dictionnaires personnels.
 * Port de DictionaryTab de main.py.
 */

const DictEditor = (() => {
  let selectorEl, searchEl, tableBody;
  let dicts = [];
  let loaded = false;
  let selectedWord = null;

  function init() {
    selectorEl = document.getElementById('dict-selector');
    searchEl = document.getElementById('dict-search');
    tableBody = document.getElementById('dict-table-body');

    selectorEl.addEventListener('change', () => {
      AppState.currentDictId = parseInt(selectorEl.value);
      loadWords();
    });

    searchEl.addEventListener('input', debounce(loadWords, 250));

    document.getElementById('btn-add-word').addEventListener('click', addWord);
    document.getElementById('btn-export-dict').addEventListener('click', exportDict);
    document.getElementById('btn-import-dict').addEventListener('click', importDict);

    document.addEventListener('keydown', (e) => {
      if (AppState.currentTab !== 'dict-editor') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWord !== null) {
        e.preventDefault();
        deleteWord(selectedWord);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const rows = [...tableBody.querySelectorAll('tr')];
        if (rows.length === 0) return;
        const idx = rows.findIndex(r => r.classList.contains('selected'));
        let next;
        if (idx === -1) {
          next = e.key === 'ArrowDown' ? 0 : rows.length - 1;
        } else {
          next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
          if (next < 0 || next >= rows.length) return;
          rows[idx].classList.remove('selected');
        }
        rows[next].classList.add('selected');
        rows[next].scrollIntoView({ block: 'nearest' });
        selectedWord = rows[next].querySelector('td strong')?.textContent || null;
      }
      if (e.key === ' ' && selectedWord !== null) {
        e.preventDefault();
        const row = tableBody.querySelector('tr.selected');
        if (row) row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    });
  }

  async function onActivate() {
    if (!loaded) {
      await loadDicts();
      loaded = true;
    }
    loadWords();
  }

  async function loadDicts() {
    try {
      dicts = await api('/api/dictionaries');
      selectorEl.innerHTML = '';
      for (const d of dicts) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        if (d.id === AppState.currentDictId) opt.selected = true;
        selectorEl.appendChild(opt);
      }
    } catch (e) {
      console.error('Erreur chargement dicts:', e);
    }
  }

  async function loadWords() {
    const search = searchEl.value.trim();
    try {
      const words = await api(`/api/dictionaries/${AppState.currentDictId}/words?search=${encodeURIComponent(search)}&limit=500`);
      renderTable(words);
    } catch (e) {
      console.error('Erreur chargement mots:', e);
    }
  }

  function renderTable(words) {
    tableBody.innerHTML = '';
    for (const w of words) {
      const defs = w.definitions ? JSON.parse(w.definitions) : [];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escHtml(w.mot)}</strong></td>
        <td>${w.mot_upper ? w.mot_upper.length : ''}</td>
        <td>${escHtml(defs.join(' / '))}</td>
        <td>${escHtml(w.categorie || '')}</td>
        <td>${escHtml(w.notes || '')}</td>
        <td>${w.date_modif || ''}</td>
        <td>
          <button class="btn btn-sm" data-action="edit">Modifier</button>
          <button class="btn btn-sm btn-transfer" data-action="to-memo" title="Transférer vers mémo">&#8594;</button>
          <button class="btn btn-sm btn-danger" data-action="delete">Suppr</button>
        </td>
      `;
      tr.querySelector('[data-action="edit"]').addEventListener('click', () => editWord(w));
      tr.querySelector('[data-action="to-memo"]').addEventListener('click', () => transferToMemo(w));
      tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteWord(w.mot));
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (tr.classList.contains('selected')) {
          tr.classList.remove('selected');
          selectedWord = null;
        } else {
          tableBody.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
          selectedWord = w.mot;
        }
      });
      tr.addEventListener('dblclick', () => editWord(w));
      tr.style.cursor = 'pointer';
      tableBody.appendChild(tr);
    }
  }

  // ========== ACTIONS ==========

  async function addWord() {
    const result = await showWordDialog('Ajouter un mot');
    if (!result) return;
    try {
      await api(`/api/dictionaries/${AppState.currentDictId}/words`, {
        method: 'POST',
        body: result
      });
      loadWords();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  async function editWord(word) {
    const defs = word.definitions ? JSON.parse(word.definitions) : [];
    const result = await showWordDialog('Modifier un mot', {
      mot: word.mot,
      definitions: defs.join('\n'),
      categorie: word.categorie || '',
      notes: word.notes || '',
    });
    if (!result) return;
    try {
      await api(`/api/dictionaries/${AppState.currentDictId}/words/${encodeURIComponent(word.mot)}`, {
        method: 'PUT',
        body: {
          definitions: result.definitions,
          categorie: result.categorie,
          notes: result.notes,
          newMot: result.mot !== word.mot ? result.mot : undefined,
        }
      });
      loadWords();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  async function deleteWord(mot) {
    if (!confirm(`Supprimer "${mot}" ?`)) return;
    try {
      await api(`/api/dictionaries/${AppState.currentDictId}/words/${encodeURIComponent(mot)}`, { method: 'DELETE' });
      loadWords();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  function exportDict() {
    window.open(`/api/dictionaries/${AppState.currentDictId}/export`, '_blank');
  }

  async function importDict() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      try {
        const result = await api(`/api/dictionaries/${AppState.currentDictId}/import`, {
          method: 'POST',
          body: { data }
        });
        alert(`${result.imported} mots importés.`);
        loadWords();
      } catch (e) {
        alert('Erreur : ' + e.message);
      }
    };
    input.click();
  }

  async function transferToMemo(word) {
    const defs = word.definitions ? JSON.parse(word.definitions) : [];
    const dictName = selectorEl.selectedOptions[0]?.textContent || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Transférer vers mémo</h3>
        <div class="form-group">
          <label>Mot</label>
          <input type="text" id="tomemo-mot" value="${escHtml(word.mot || '')}">
        </div>
        <div class="form-group">
          <label>Dictionnaire source</label>
          <input type="text" id="tomemo-dict" value="${escHtml(dictName)}" readonly style="background:#f0f0f0">
        </div>
        <div class="form-group" style="position:relative">
          <label>Catégorie</label>
          <input type="text" id="tomemo-cat" value="${escHtml(word.categorie || '')}" autocomplete="off">
          <div id="tomemo-cat-suggestions" class="cat-suggestions" style="display:none"></div>
        </div>
        <div class="form-group">
          <label>Note</label>
          <textarea id="tomemo-note" rows="3">${escHtml(defs.join(' / '))}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn" id="tomemo-cancel">Annuler</button>
          <button class="btn btn-primary" id="tomemo-ok">Transférer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const motInput = overlay.querySelector('#tomemo-mot');
    motInput.focus();
    motInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(motInput.value);
      if (motInput.value !== cleaned) motInput.value = cleaned;
    });

    const catInput = overlay.querySelector('#tomemo-cat');
    catInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(catInput.value);
      if (catInput.value !== cleaned) catInput.value = cleaned;
    });

    // Autocomplete catégorie
    const catSugg = overlay.querySelector('#tomemo-cat-suggestions');
    let categories = [];
    api('/api/dictionaries/categories').then(cats => { categories = cats; }).catch(() => {});

    catInput.addEventListener('focus', () => showCatSugg());
    catInput.addEventListener('input', () => showCatSugg());

    function showCatSugg() {
      const val = catInput.value.toUpperCase();
      const filtered = val
        ? categories.filter(c => c.categorie.startsWith(val))
        : categories;
      if (filtered.length === 0) { catSugg.style.display = 'none'; return; }
      catSugg.innerHTML = filtered.map(c =>
        `<div class="cat-suggestion-item" data-val="${escHtml(c.categorie)}">${escHtml(c.categorie)} <span class="cat-count">(${c.cnt})</span></div>`
      ).join('');
      catSugg.style.display = 'block';
      catSugg.querySelectorAll('.cat-suggestion-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          catInput.value = item.dataset.val;
          catSugg.style.display = 'none';
        });
      });
    }

    catInput.addEventListener('blur', () => {
      setTimeout(() => { catSugg.style.display = 'none'; }, 150);
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        overlay.querySelector('#tomemo-ok').click();
      }
    });

    overlay.querySelector('#tomemo-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#tomemo-ok').addEventListener('click', async () => {
      const mot = overlay.querySelector('#tomemo-mot').value.trim();
      if (!mot) { alert('Mot requis'); return; }
      if (!/^[A-Z]+$/.test(mot)) { alert('Le mot ne doit contenir que des lettres A-Z'); return; }

      const categorie = catInput.value.trim();
      const note = overlay.querySelector('#tomemo-note').value.trim();
      const dictId = AppState.currentDictId;

      try {
        await api('/api/memos', {
          method: 'POST',
          body: { mot, dict_target: dictName, categorie, note }
        });
        await api(`/api/dictionaries/${dictId}/words/${encodeURIComponent(word.mot)}`, { method: 'DELETE' });
        overlay.remove();
        selectedWord = null;
        // Push undo action
        TransferUndo.push({
          type: 'dict-to-memo',
          dict: { dictId, dictName, mot: word.mot, definitions: defs, categorie: word.categorie || '', notes: word.notes || '' },
          memo: { mot, dict_target: dictName, categorie, note }
        });
        loadWords();
      } catch (e) { alert('Erreur : ' + e.message); }
    });
  }

  // ========== DIALOG ==========

  function showWordDialog(title, initial = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${title}</h3>
          <div class="form-group">
            <label>Mot</label>
            <input type="text" id="dlg-mot" value="${escHtml(initial.mot || '')}">
          </div>
          <div class="form-group">
            <label>Definitions (une par ligne)</label>
            <textarea id="dlg-defs">${escHtml(initial.definitions || '')}</textarea>
          </div>
          <div class="form-group" style="position:relative">
            <label>Categorie</label>
            <input type="text" id="dlg-cat" value="${escHtml(initial.categorie || '')}" autocomplete="off">
            <div id="dlg-cat-suggestions" class="cat-suggestions" style="display:none"></div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea id="dlg-notes">${escHtml(initial.notes || '')}</textarea>
          </div>
          <div class="modal-actions">
            <button class="btn" id="dlg-cancel">Annuler</button>
            <button class="btn btn-primary" id="dlg-ok">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Focus automatique sur le champ Mot
      overlay.querySelector('#dlg-mot').focus();

      // Mot et Catégorie : A-Z uniquement, auto-majuscule, accents retirés
      for (const id of ['#dlg-mot', '#dlg-cat']) {
        const input = overlay.querySelector(id);
        input.addEventListener('input', () => {
          const cleaned = normalizeForGrid(input.value);
          if (input.value !== cleaned) input.value = cleaned;
        });
      }

      // Autocomplete catégorie
      const catInput = overlay.querySelector('#dlg-cat');
      const catSugg = overlay.querySelector('#dlg-cat-suggestions');
      let categories = [];
      api('/api/dictionaries/categories').then(cats => { categories = cats; }).catch(() => {});

      catInput.addEventListener('focus', () => showCatSuggestions());
      catInput.addEventListener('input', () => showCatSuggestions());

      function showCatSuggestions() {
        const val = catInput.value.toUpperCase();
        const filtered = val
          ? categories.filter(c => c.categorie.startsWith(val))
          : categories;
        if (filtered.length === 0) { catSugg.style.display = 'none'; return; }
        catSugg.innerHTML = filtered.map(c =>
          `<div class="cat-suggestion-item" data-val="${escHtml(c.categorie)}">${escHtml(c.categorie)} <span class="cat-count">(${c.cnt})</span></div>`
        ).join('');
        catSugg.style.display = 'block';
        catSugg.querySelectorAll('.cat-suggestion-item').forEach(item => {
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            catInput.value = item.dataset.val;
            catSugg.style.display = 'none';
          });
        });
      }

      catInput.addEventListener('blur', () => {
        setTimeout(() => { catSugg.style.display = 'none'; }, 150);
      });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          overlay.querySelector('#dlg-ok').click();
        }
      });

      overlay.querySelector('#dlg-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });
      overlay.querySelector('#dlg-ok').addEventListener('click', () => {
        const mot = overlay.querySelector('#dlg-mot').value.trim();
        if (!mot) { alert('Mot requis'); return; }
        if (!/^[A-Z]+$/.test(mot)) { alert('Le mot ne doit contenir que des lettres A-Z'); return; }
        const defs = overlay.querySelector('#dlg-defs').value.split('\n').map(d => d.trim()).filter(Boolean);
        const categorie = overlay.querySelector('#dlg-cat').value.trim();
        const notes = overlay.querySelector('#dlg-notes').value.trim();
        overlay.remove();
        resolve({ mot, definitions: defs, categorie, notes });
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); resolve(null); }
      });
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, onActivate, loadDicts, loadWords };
})();
