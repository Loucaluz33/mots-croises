/**
 * Gestion des dictionnaires — activation/désactivation, téléchargements, groupes.
 * Port de DictionariesTab de main.py.
 */

const DictManagement = (() => {
  let contentEl;
  let loaded = false;

  function init() {
    contentEl = document.getElementById('dict-mgmt-content');
  }

  async function onActivate() {
    if (!loaded) {
      await render();
      loaded = true;
    }
  }

  async function render() {
    contentEl.innerHTML = '<p>Chargement...</p>';
    try {
      const [stats, settings, groups, externalDicts] = await Promise.all([
        api('/api/dict-management/stats'),
        api('/api/dict-management/settings'),
        api('/api/dict-management/groups'),
        api('/api/dict-management/external-dicts'),
      ]);

      let html = '<h2>Gestion des dictionnaires</h2>';
      html += '<p style="color:#666;margin-bottom:12px;">Cochez les dictionnaires a utiliser dans les suggestions.</p>';

      // Dictionnaires personnels
      html += '<div class="dict-section"><h3>Dictionnaires personnels</h3>';
      html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
      html += '<button class="btn btn-sm btn-primary" id="btn-add-dict">+ Nouveau</button>';
      html += '</div>';
      for (const pd of stats.personalDicts) {
        const src = `personnel_${pd.id}`;
        const s = settings[src] || {};
        const count = stats.personalByDict[pd.id]?.total_words || 0;
        html += `
          <div class="dict-card">
            <div class="info">
              <div class="name">${escHtml(pd.name)}</div>
              <div class="count">${count} mots</div>
            </div>
            <input type="checkbox" data-source="${src}" ${s.enabled ? 'checked' : ''}>
            <button class="btn btn-sm" data-browse="${src}">Consulter</button>
            <button class="btn btn-sm" data-rename="${pd.id}">Renommer</button>
            <button class="btn btn-sm btn-danger" data-delete-dict="${pd.id}">Supprimer</button>
          </div>`;
      }
      html += '</div>';

      // Dictionnaires externes (inclut Lexique)
      html += '<div class="dict-section"><h3>Dictionnaires externes</h3>';
      html += '<button class="btn btn-sm" id="btn-download-all" style="margin-bottom:8px;">Tout telecharger</button>';
      const lexS = settings.lexique || {};
      const lexLabel = (lexS.custom_label) || 'Lexique 3 francais';
      html += `
        <div class="dict-card">
          <div class="info">
            <div class="name">${escHtml(lexLabel)}</div>
            <div class="desc">Base lexicale française (Lexique 3.83)</div>
            <div class="count">${stats.lexique.distinct_words} mots distincts (${stats.lexique.total_entries} entrees)</div>
          </div>
          <input type="checkbox" data-source="lexique" ${lexS.enabled ? 'checked' : ''}>
          <button class="btn btn-sm" data-download="lexique">Re-telecharger</button>
          <button class="btn btn-sm" data-browse="lexique">Consulter</button>
          <button class="btn btn-sm" data-rename-ext="lexique">Renommer</button>
          <button class="btn btn-sm btn-danger" data-delete-ext="lexique">Supprimer</button>
        </div>`;
      for (const [source, info] of Object.entries(externalDicts)) {
        const s = settings[source] || {};
        const count = stats.external[source] || 0;
        html += `
          <div class="dict-card">
            <div class="info">
              <div class="name">${escHtml((s.custom_label) || info.label)}</div>
              <div class="desc">${info.description}</div>
              <div class="count">${count > 0 ? count + ' mots' : 'Non telecharge'}</div>
            </div>
            <input type="checkbox" data-source="${source}" ${s.enabled ? 'checked' : ''}>
            <button class="btn btn-sm" data-download="${source}">${count > 0 ? 'Re-telecharger' : 'Telecharger'}</button>
            <button class="btn btn-sm" data-browse="${source}">Consulter</button>
            <button class="btn btn-sm" data-rename-ext="${source}">Renommer</button>
            ${count > 0 ? `<button class="btn btn-sm btn-danger" data-delete-ext="${source}">Supprimer</button>` : ''}
          </div>`;
      }
      html += '</div>';

      // Groupes de filtres
      html += '<div class="dict-section groups-section"><h3>Groupes de filtres</h3>';
      html += '<button class="btn btn-sm btn-primary" id="btn-add-group" style="margin-bottom:8px;">+ Nouveau groupe</button>';
      for (const g of groups) {
        html += `
          <div class="group-card">
            <div class="group-header">
              <span class="group-name">${escHtml(g.name)}</span>
              <button class="btn btn-sm" data-edit-group="${g.id}">Modifier</button>
              <button class="btn btn-sm btn-danger" data-delete-group="${g.id}">Suppr</button>
            </div>
            <div class="sources">${g.sources.map(s => `<span class="source-tag">${s}</span>`).join('')}</div>
          </div>`;
      }
      html += '</div>';

      // Progress area
      html += '<div class="progress-container" id="progress-container" style="display:none;">';
      html += '<p class="progress-msg" id="progress-msg"></p></div>';

      contentEl.innerHTML = html;
      bindEvents(externalDicts, groups);

    } catch (e) {
      contentEl.innerHTML = `<p style="color:red;">Erreur: ${e.message}</p>`;
    }
  }

  function bindEvents(externalDicts, groups) {
    // Checkboxes
    contentEl.querySelectorAll('input[data-source]').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          await api(`/api/dict-management/settings/${cb.dataset.source}`, {
            method: 'PUT', body: { enabled: cb.checked }
          });
        } catch (e) { alert(e.message); }
      });
    });

    // Ajouter dico perso
    const addDictBtn = document.getElementById('btn-add-dict');
    if (addDictBtn) {
      addDictBtn.addEventListener('click', async () => {
        const name = prompt('Nom du nouveau dictionnaire :');
        if (!name) return;
        try {
          await api('/api/dictionaries', { method: 'POST', body: { name } });
          loaded = false;
          await render();
          SuggestionPanel.loadGroups();
          DictEditor.loadDicts();
        } catch (e) { alert(e.message); }
      });
    }

    // Renommer / supprimer dico
    contentEl.querySelectorAll('[data-rename]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const currentName = btn.closest('.dict-card').querySelector('.name').textContent;
        const name = await showRenameModal('Renommer le dictionnaire', currentName);
        if (!name) return;
        try {
          await api(`/api/dictionaries/${btn.dataset.rename}`, { method: 'PUT', body: { name } });
          loaded = false; await render();
          DictEditor.loadDicts();
        } catch (e) { alert(e.message); }
      });
    });

    contentEl.querySelectorAll('[data-delete-dict]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce dictionnaire ?')) return;
        try {
          await api(`/api/dictionaries/${btn.dataset.deleteDict}`, { method: 'DELETE' });
          loaded = false; await render();
          SuggestionPanel.loadGroups();
          DictEditor.loadDicts();
        } catch (e) { alert(e.message); }
      });
    });

    // Download externe
    contentEl.querySelectorAll('[data-download]').forEach(btn => {
      btn.addEventListener('click', () => downloadSource(btn.dataset.download));
    });

    const downloadAllBtn = document.getElementById('btn-download-all');
    if (downloadAllBtn) {
      downloadAllBtn.addEventListener('click', async () => {
        for (const source of Object.keys(externalDicts)) {
          await downloadSource(source);
        }
      });
    }

    // Browse
    contentEl.querySelectorAll('[data-browse]').forEach(btn => {
      btn.addEventListener('click', () => browseSource(btn.dataset.browse));
    });

    // Renommer dictionnaire externe
    contentEl.querySelectorAll('[data-rename-ext]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const currentName = btn.closest('.dict-card').querySelector('.name').textContent;
        const label = await showRenameModal('Renommer le dictionnaire', currentName);
        if (!label) return;
        try {
          await api(`/api/dict-management/rename/${btn.dataset.renameExt}`, { method: 'PUT', body: { label } });
          loaded = false; await render();
        } catch (e) { alert(e.message); }
      });
    });

    // Supprimer dictionnaire externe
    contentEl.querySelectorAll('[data-delete-ext]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce dictionnaire ?')) return;
        try {
          await api(`/api/dict-management/delete-source/${btn.dataset.deleteExt}`, { method: 'DELETE' });
          loaded = false; await render();
          SuggestionPanel.loadGroups();
        } catch (e) { alert(e.message); }
      });
    });

    // Groupes
    const addGroupBtn = document.getElementById('btn-add-group');
    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', async () => {
        const name = prompt('Nom du groupe :');
        if (!name) return;
        try {
          await api('/api/dict-management/groups', { method: 'POST', body: { name, sources: [] } });
          loaded = false; await render();
          SuggestionPanel.loadGroups();
        } catch (e) { alert(e.message); }
      });
    }

    contentEl.querySelectorAll('[data-edit-group]').forEach(btn => {
      btn.addEventListener('click', () => editGroup(parseInt(btn.dataset.editGroup), groups));
    });

    contentEl.querySelectorAll('[data-delete-group]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce groupe ?')) return;
        try {
          await api(`/api/dict-management/groups/${btn.dataset.deleteGroup}`, { method: 'DELETE' });
          loaded = false; await render();
          SuggestionPanel.loadGroups();
        } catch (e) { alert(e.message); }
      });
    });
  }

  // ========== DOWNLOAD SSE ==========

  async function downloadSource(source) {
    const progressEl = document.getElementById('progress-container');
    const msgEl = document.getElementById('progress-msg');
    progressEl.style.display = 'block';
    msgEl.textContent = `Téléchargement ${source}...`;

    try {
      const resp = await fetch(`/api/dict-management/download/${source}`, { method: 'POST' });
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
              if (data.type === 'progress') msgEl.textContent = data.message;
              else if (data.type === 'done') msgEl.textContent = `Terminé ! ${data.total} entrées.`;
              else if (data.type === 'error') msgEl.textContent = `Erreur : ${data.message}`;
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      msgEl.textContent = `Erreur : ${e.message}`;
    }

    // Rafraîchir
    loaded = false;
    await render();
    SuggestionPanel.loadGroups();
  }

  // ========== BROWSE ==========

  async function browseSource(source) {
    let label = source;
    if (source.startsWith('personnel_')) {
      try {
        const dicts = await api('/api/dictionaries');
        const dict = dicts.find(d => `personnel_${d.id}` === source);
        if (dict) label = dict.name;
      } catch (e) {}
    } else {
      const settings = await api('/api/dict-management/settings').catch(() => ({}));
      const s = settings[source];
      if (s && s.custom_label) {
        label = s.custom_label;
      } else {
        const sourceLabels = {
          sigles: 'Sigles & Acronymes', communes: 'Communes de France',
          prenoms: 'Prénoms', toponymes: 'Toponymes', personnalites: 'Personnalités',
          wikipedia: 'Wikipedia FR', lexique: 'Lexique 3',
        };
        label = sourceLabels[source] || source;
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal browse-modal">
        <h3>Consulter — ${label}</h3>
        <div class="browse-search-bar">
          <input type="text" id="browse-search" placeholder="Rechercher..." autocomplete="off">
          <span id="browse-total" class="browse-total"></span>
        </div>
        <div class="browse-results" id="browse-results"></div>
        <div class="modal-actions">
          <button class="btn" id="browse-close">Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector('#browse-search');
    const resultsEl = overlay.querySelector('#browse-results');
    const totalEl = overlay.querySelector('#browse-total');

    searchInput.focus();

    // A-Z uniquement, auto-majuscule
    searchInput.addEventListener('input', () => {
      const cleaned = normalizeForGrid(searchInput.value);
      if (searchInput.value !== cleaned) searchInput.value = cleaned;
    });

    async function doSearch() {
      const q = searchInput.value.trim();
      try {
        const url = `/api/dictionaries/browse/${source}?search=${encodeURIComponent(q)}&limit=2000`;
        const result = await api(url);
        let html = '';

        if (result.all) {
          totalEl.textContent = `${result.all.length} mot(s)`;
          html = result.all.length > 0 ? browseTable(result.all) : '<div class="browse-empty">Dictionnaire vide</div>';
        } else {
          const starts = result.starts.sort((a, b) => b.mot.length - a.mot.length);
          const contains = result.contains.sort((a, b) => b.mot.length - a.mot.length);
          const total = starts.length + contains.length;
          totalEl.textContent = `${total} mot(s)`;
          if (starts.length > 0) {
            html += `<div class="browse-section-title">Commence par « ${q} » (${starts.length})</div>`;
            html += browseTable(starts);
          }
          if (contains.length > 0) {
            html += `<div class="browse-section-title contains">Contient « ${q} » (${contains.length})</div>`;
            html += browseTable(contains);
          }
          if (total === 0) html = '<div class="browse-empty">Aucun résultat</div>';
        }
        resultsEl.innerHTML = html;
      } catch (e) {
        resultsEl.innerHTML = `<div class="browse-empty">Erreur : ${e.message}</div>`;
      }
    }

    searchInput.addEventListener('input', debounce(doSearch, 300));
    doSearch(); // Charger tous les mots au démarrage

    function browseTable(rows) {
      let html = '<table class="browse-table"><thead><tr><th></th><th>Mot</th><th>Catégorie</th><th>Définition</th></tr></thead><tbody>';
      rows.forEach((w, i) => {
        html += `<tr><td class="browse-num">${i + 1}</td><td><strong>${w.mot}</strong></td><td>${w.categorie || ''}</td><td>${w.definition || ''}</td></tr>`;
      });
      html += '</tbody></table>';
      return html;
    }

    overlay.querySelector('#browse-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ========== EDIT GROUP ==========

  async function editGroup(groupId, groups) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    // Récupérer toutes les sources disponibles
    const settings = await api('/api/dict-management/settings');
    const allSources = Object.keys(settings);
    const selectedSources = new Set(group.sources);

    const name = prompt('Nom du groupe :', group.name);
    if (name === null) return;

    const sourcesStr = prompt(
      `Sources (séparées par des virgules) :\nDisponibles : ${allSources.join(', ')}\nActuelles :`,
      group.sources.join(', ')
    );
    if (sourcesStr === null) return;

    const sources = sourcesStr.split(',').map(s => s.trim()).filter(Boolean);

    try {
      await api(`/api/dict-management/groups/${groupId}`, {
        method: 'PUT', body: { name, sources }
      });
      loaded = false;
      await render();
      SuggestionPanel.loadGroups();
    } catch (e) { alert(e.message); }
  }

  function showRenameModal(title, currentName) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal browse-modal" style="max-width:400px">
          <h3>${title}</h3>
          <input type="text" class="rename-input" value="${escHtml(currentName)}" style="width:100%;padding:8px 12px;border:1px solid #cdd5e0;border-radius:6px;font-size:14px;margin:12px 0;box-sizing:border-box">
          <div class="modal-actions">
            <button class="btn rename-cancel">Annuler</button>
            <button class="btn btn-primary rename-ok">Renommer</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('.rename-input');
      input.focus();
      input.select();
      const close = (val) => { overlay.remove(); resolve(val); };
      overlay.querySelector('.rename-cancel').addEventListener('click', () => close(null));
      overlay.querySelector('.rename-ok').addEventListener('click', () => close(input.value.trim() || null));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') close(input.value.trim() || null);
        if (e.key === 'Escape') close(null);
      });
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, onActivate };
})();
