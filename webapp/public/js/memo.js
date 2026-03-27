/**
 * Onglet Memo — carnet de notes personnel.
 */

const Memo = (() => {
  let searchEl, countEl, listEl;
  let loaded = false;
  let dicts = [];
  let currentSearch = '';
  let selectedMemoId = null;

  function init() {
    searchEl = document.getElementById('memo-search');
    countEl = document.getElementById('memo-count');
    listEl = document.getElementById('memo-list');

    searchEl.addEventListener('input', debounce(() => {
      currentSearch = searchEl.value.trim();
      loadMemos();
    }, 250));

    document.getElementById('btn-add-memo').addEventListener('click', () => showDialog());

    document.addEventListener('keydown', (e) => {
      if (AppState.currentTab !== 'memo') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMemoId !== null) {
        e.preventDefault();
        deleteMemo(selectedMemoId);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const rows = [...listEl.querySelectorAll('tr[data-id]')];
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
        selectedMemoId = parseInt(rows[next].dataset.id);
      }
      if (e.key === ' ' && selectedMemoId !== null) {
        e.preventDefault();
        const memoEl = listEl.querySelector(`tr[data-id="${selectedMemoId}"]`);
        if (memoEl) memoEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    });
  }

  async function deleteMemo(id) {
    if (!confirm('Supprimer ce memo ?')) return;
    try {
      await api(`/api/memos/${id}`, { method: 'DELETE' });
      selectedMemoId = null;
      loadMemos();
    } catch (e) { alert(e.message); }
  }

  async function onActivate() {
    await loadDicts();
    await loadMemos();
    loaded = true;
  }

  async function loadDicts() {
    try {
      dicts = await api('/api/dictionaries');
    } catch (e) { console.error(e); }
  }

  async function loadMemos() {
    try {
      const params = currentSearch ? `?search=${encodeURIComponent(currentSearch)}` : '';
      const memos = await api(`/api/memos${params}`);
      countEl.textContent = `${memos.length} memo${memos.length > 1 ? 's' : ''}`;
      renderList(memos);
    } catch (e) {
      console.error('Erreur chargement memos:', e);
    }
  }

  function highlight(text, search) {
    if (!search || !text) return escHtml(text);
    const escaped = escHtml(text);
    const searchEsc = escHtml(search);
    const regex = new RegExp(`(${searchEsc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="memo-highlight">$1</mark>');
  }

  function renderList(memos) {
    if (memos.length === 0) {
      listEl.innerHTML = '<div class="memo-empty">Aucun memo</div>';
      return;
    }

    let html = '<table class="memo-table"><thead><tr>';
    html += '<th>Mot</th><th>Dictionnaire</th><th>Catégorie</th><th>Note</th><th>Date</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const m of memos) {
      const dictName = m.dict_target || '';
      html += `<tr data-id="${m.id}">
        <td><strong>${highlight(m.mot, currentSearch)}</strong></td>
        <td>${escHtml(dictName)}</td>
        <td>${escHtml(m.categorie || '')}</td>
        <td>${highlight(m.note, currentSearch)}</td>
        <td class="memo-date">${m.date_modif || ''}</td>
        <td class="memo-actions">
          <button class="btn btn-sm" data-edit="${m.id}">Modifier</button>
          <button class="btn btn-sm btn-transfer" data-transfer="${m.id}" title="Transférer vers dictionnaire">&#8592;</button>
          <button class="btn btn-sm btn-danger" data-delete="${m.id}">Suppr</button>
        </td>
      </tr>`;
    }

    html += '</tbody></table>';
    listEl.innerHTML = html;

    // Bind events
    listEl.querySelectorAll('[data-edit]').forEach(btn => {
      const memo = memos.find(m => m.id === parseInt(btn.dataset.edit));
      btn.addEventListener('click', () => showDialog(memo));
    });

    listEl.querySelectorAll('[data-transfer]').forEach(btn => {
      const memo = memos.find(m => m.id === parseInt(btn.dataset.transfer));
      btn.addEventListener('click', () => showTransferDialog(memo));
    });

    listEl.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteMemo(parseInt(btn.dataset.delete)));
    });

    // Click to select, double-click to edit
    listEl.querySelectorAll('tr[data-id]').forEach(tr => {
      const memo = memos.find(m => m.id === parseInt(tr.dataset.id));
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (tr.classList.contains('selected')) {
          tr.classList.remove('selected');
          selectedMemoId = null;
        } else {
          listEl.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
          selectedMemoId = memo.id;
        }
      });
      tr.addEventListener('dblclick', () => showDialog(memo));
      tr.style.cursor = 'pointer';
    });
  }

  async function showDialog(memo = null) {
    await loadDicts();

    const isEdit = !!memo;
    const title = isEdit ? 'Modifier le memo' : 'Nouveau memo';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let dictOptions = '<option value="">-- Aucun --</option>';
    for (const d of dicts) {
      const selected = memo && memo.dict_target === d.name ? 'selected' : '';
      dictOptions += `<option value="${escHtml(d.name)}" ${selected}>${escHtml(d.name)}</option>`;
    }

    overlay.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <div class="form-group">
          <label>Mot</label>
          <input type="text" id="memo-dlg-mot" value="${escHtml(memo?.mot || '')}">
        </div>
        <div class="form-group">
          <label>Dictionnaire cible</label>
          <select id="memo-dlg-dict">${dictOptions}</select>
        </div>
        <div class="form-group" style="position:relative">
          <label>Catégorie</label>
          <input type="text" id="memo-dlg-cat" value="${escHtml(memo?.categorie || '')}" autocomplete="off">
          <div id="memo-dlg-cat-suggestions" class="cat-suggestions" style="display:none"></div>
        </div>
        <div class="form-group">
          <label>Note</label>
          <textarea id="memo-dlg-note" rows="4">${escHtml(memo?.note || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn" id="memo-dlg-cancel">Annuler</button>
          <button class="btn btn-primary" id="memo-dlg-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const motInput = overlay.querySelector('#memo-dlg-mot');
    motInput.focus();
    motInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(motInput.value);
      if (motInput.value !== cleaned) motInput.value = cleaned;
    });

    // Catégorie: A-Z only + autocomplete
    const catInput = overlay.querySelector('#memo-dlg-cat');
    catInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(catInput.value);
      if (catInput.value !== cleaned) catInput.value = cleaned;
    });

    const catSugg = overlay.querySelector('#memo-dlg-cat-suggestions');
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
        overlay.querySelector('#memo-dlg-ok').click();
      }
    });

    overlay.querySelector('#memo-dlg-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#memo-dlg-ok').addEventListener('click', async () => {
      const mot = overlay.querySelector('#memo-dlg-mot').value.trim();
      const dict_target = overlay.querySelector('#memo-dlg-dict').value;
      const categorie = catInput.value.trim();
      const note = overlay.querySelector('#memo-dlg-note').value.trim();

      if (!mot && !dict_target && !note) {
        alert('Au moins un champ doit etre rempli');
        return;
      }

      try {
        if (isEdit) {
          await api(`/api/memos/${memo.id}`, { method: 'PUT', body: { mot, dict_target, categorie, note } });
        } else {
          await api('/api/memos', { method: 'POST', body: { mot, dict_target, categorie, note } });
        }
        overlay.remove();
        loadMemos();
      } catch (e) { alert(e.message); }
    });
  }

  async function showTransferDialog(memo) {
    await loadDicts();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    let dictOptions = '';
    for (const d of dicts) {
      const selected = memo.dict_target === d.name ? 'selected' : '';
      dictOptions += `<option value="${escHtml(d.name)}" data-id="${d.id}" ${selected}>${escHtml(d.name)}</option>`;
    }

    overlay.innerHTML = `
      <div class="modal">
        <h3>Transférer vers dictionnaire</h3>
        <div class="form-group">
          <label>Mot</label>
          <input type="text" id="transfer-mot" value="${escHtml(memo.mot || '')}">
        </div>
        <div class="form-group">
          <label>Dictionnaire cible</label>
          <select id="transfer-dict">${dictOptions}</select>
        </div>
        <div class="form-group">
          <label>Définition</label>
          <textarea id="transfer-def" rows="3">${escHtml(memo.note || '')}</textarea>
        </div>
        <div class="form-group" style="position:relative">
          <label>Catégorie</label>
          <input type="text" id="transfer-cat" value="${escHtml(memo.categorie || '')}" autocomplete="off">
          <div id="transfer-cat-suggestions" class="cat-suggestions" style="display:none"></div>
        </div>
        <div class="modal-actions">
          <button class="btn" id="transfer-cancel">Annuler</button>
          <button class="btn btn-primary" id="transfer-ok">Transférer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const motInput = overlay.querySelector('#transfer-mot');
    motInput.focus();
    motInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(motInput.value);
      if (motInput.value !== cleaned) motInput.value = cleaned;
    });

    const catInput = overlay.querySelector('#transfer-cat');
    catInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(catInput.value);
      if (catInput.value !== cleaned) catInput.value = cleaned;
    });

    // Autocomplete catégorie
    const catSugg = overlay.querySelector('#transfer-cat-suggestions');
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
        overlay.querySelector('#transfer-ok').click();
      }
    });

    overlay.querySelector('#transfer-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#transfer-ok').addEventListener('click', async () => {
      const mot = overlay.querySelector('#transfer-mot').value.trim();
      if (!mot) { alert('Mot requis'); return; }
      if (!/^[A-Z]+$/.test(mot)) { alert('Le mot ne doit contenir que des lettres A-Z'); return; }

      const dictSelect = overlay.querySelector('#transfer-dict');
      if (!dictSelect.value) { alert('Dictionnaire cible requis'); return; }
      const dictName = dictSelect.value;
      const dictId = dictSelect.selectedOptions[0].dataset.id;
      const def = overlay.querySelector('#transfer-def').value.trim();
      const categorie = catInput.value.trim();

      try {
        await api(`/api/dictionaries/${dictId}/words`, {
          method: 'POST',
          body: { mot, definitions: def ? [def] : [], categorie, notes: '' }
        });
        await api(`/api/memos/${memo.id}`, { method: 'DELETE' });
        overlay.remove();
        selectedMemoId = null;
        // Push undo action
        TransferUndo.push({
          type: 'memo-to-dict',
          memo: { mot: memo.mot, dict_target: memo.dict_target, categorie: memo.categorie, note: memo.note },
          dict: { dictId, dictName, mot }
        });
        loadMemos();
      } catch (e) { alert('Erreur : ' + e.message); }
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, onActivate, loadMemos };
})();
