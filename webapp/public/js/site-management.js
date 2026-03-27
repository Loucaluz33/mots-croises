/**
 * Module Gestion Site — gere les grilles online/offline du site joueur.
 * Drag & drop pour reordonner les grilles online.
 * Clic + bouton swap pour deplacer entre online/offline.
 * Double-clic sur NomOnline pour le modifier.
 */
const SiteManagement = (() => {
  let onlineList = [];
  let offlineList = [];
  let originalOnline = [];
  let selectedFile = null;
  let selectedSide = null;

  // Drag state
  let dragFile = null;
  let dragOverIdx = -1;

  function init() {
    document.getElementById('btn-site-swap').addEventListener('click', swapSelected);
    document.getElementById('btn-site-apply').addEventListener('click', applyChanges);
  }

  async function onActivate() {
    await loadGrilles();
  }

  async function loadGrilles() {
    try {
      const data = await api('/api/site/grilles');
      onlineList = data.online || [];
      offlineList = data.offline || [];
      originalOnline = onlineList.map(g => g.file);
      selectedFile = null;
      selectedSide = null;
      renderLists();
      updateApplyButton();
    } catch (e) {
      console.error('[SiteManagement] load error:', e);
    }
  }

  function renderLists() {
    renderList('site-online-list', onlineList, 'online');
    renderList('site-offline-list', offlineList, 'offline');
  }

  function renderList(containerId, grilles, side) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'site-row site-row-header';
    header.innerHTML =
      '<span class="site-col site-col-name">Nom</span>' +
      '<span class="site-col site-col-online">Nom online</span>' +
      '<span class="site-col site-col-dim">Dim.</span>' +
      '<span class="site-col site-col-author">Auteur</span>';
    container.appendChild(header);

    for (let i = 0; i < grilles.length; i++) {
      const g = grilles[i];
      const item = document.createElement('div');
      item.className = 'site-row site-item';
      if (g.file === selectedFile && side === selectedSide) {
        item.classList.add('selected');
      }
      item.dataset.file = g.file;
      item.dataset.side = side;
      item.dataset.index = i;

      const sizeTxt = g.size ? `${g.size.rows}x${g.size.cols}` : '';

      const colName = document.createElement('span');
      colName.className = 'site-col site-col-name';
      colName.textContent = g.title;

      const colOnline = document.createElement('span');
      colOnline.className = 'site-col site-col-online site-col-editable';
      colOnline.textContent = g.onlineName || g.title;
      colOnline.title = 'Double-cliquer pour modifier';
      colOnline.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openOnlineNameModal(g);
      });

      const colDim = document.createElement('span');
      colDim.className = 'site-col site-col-dim';
      colDim.textContent = sizeTxt;

      const colAuthor = document.createElement('span');
      colAuthor.className = 'site-col site-col-author';
      colAuthor.textContent = g.author;

      item.appendChild(colName);
      item.appendChild(colOnline);
      item.appendChild(colDim);
      item.appendChild(colAuthor);

      // Clic = selection
      item.addEventListener('click', () => {
        if (selectedFile === g.file && selectedSide === side) {
          selectedFile = null;
          selectedSide = null;
        } else {
          selectedFile = g.file;
          selectedSide = side;
        }
        renderLists();
      });

      // Drag & drop uniquement pour la liste online
      if (side === 'online') {
        item.draggable = true;

        item.addEventListener('dragstart', (e) => {
          dragFile = g.file;
          item.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
          dragFile = null;
          dragOverIdx = -1;
          item.classList.remove('dragging');
          renderLists();
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          container.querySelectorAll('.site-item').forEach(el => el.classList.remove('drop-above', 'drop-below'));
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) {
            item.classList.add('drop-above');
          } else {
            item.classList.add('drop-below');
          }
        });

        item.addEventListener('dragleave', () => {
          item.classList.remove('drop-above', 'drop-below');
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!dragFile || dragFile === g.file) return;

          const fromIdx = onlineList.findIndex(x => x.file === dragFile);
          if (fromIdx === -1) return;

          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const insertBefore = e.clientY < midY;

          const [moved] = onlineList.splice(fromIdx, 1);
          let toIdx = onlineList.findIndex(x => x.file === g.file);
          if (!insertBefore) toIdx++;
          onlineList.splice(toIdx, 0, moved);

          dragFile = null;
          dragOverIdx = -1;
          renderLists();
          updateApplyButton();
        });
      }

      container.appendChild(item);
    }
  }

  // ===== Modal pour modifier le NomOnline =====
  function openOnlineNameModal(grille) {
    // Supprimer une modale existante
    const existing = document.getElementById('online-name-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'online-name-modal';
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-content online-name-modal';

    const title = document.createElement('h3');
    title.textContent = 'Modifier le nom online';
    modal.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'modal-desc';
    desc.textContent = `Grille : ${grille.title} (${grille.file})`;
    modal.appendChild(desc);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = grille.onlineName || grille.title;
    input.placeholder = 'Nom affiche sur le site';
    modal.appendChild(input);

    const statusEl = document.createElement('span');
    statusEl.className = 'site-status';

    const btnRow = document.createElement('div');
    btnRow.className = 'modal-btn-row';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-secondary';
    btnCancel.textContent = 'Annuler';
    btnCancel.addEventListener('click', () => overlay.remove());

    const btnApply = document.createElement('button');
    btnApply.className = 'btn btn-disabled';
    btnApply.disabled = true;
    btnApply.textContent = 'Appliquer';

    // Activer le bouton seulement si la valeur a change
    const originalValue = input.value;
    input.addEventListener('input', () => {
      const changed = input.value.trim() !== '' && input.value.trim() !== originalValue;
      btnApply.disabled = !changed;
      btnApply.className = changed ? 'btn btn-primary' : 'btn btn-disabled';
    });

    btnApply.addEventListener('click', async () => {
      const newName = input.value.trim();
      if (!newName || newName === originalValue) return;

      btnApply.textContent = 'Application...';
      btnApply.disabled = true;

      try {
        const result = await api('/api/site/online-name', {
          method: 'PUT',
          body: { file: grille.file, onlineName: newName },
        });

        // Mettre a jour les listes en memoire
        const inOnline = onlineList.find(g => g.file === grille.file);
        if (inOnline) inOnline.onlineName = newName;
        const inOffline = offlineList.find(g => g.file === grille.file);
        if (inOffline) inOffline.onlineName = newName;

        renderLists();

        statusEl.textContent = result.message || 'Nom mis a jour';
        statusEl.className = 'site-status success';
        btnRow.insertBefore(statusEl, btnCancel);
        setTimeout(() => overlay.remove(), 1500);
      } catch (e) {
        statusEl.textContent = 'Erreur: ' + e.message;
        statusEl.className = 'site-status error';
        btnRow.insertBefore(statusEl, btnCancel);
        btnApply.textContent = 'Appliquer';
        btnApply.disabled = false;
      }
    });

    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnApply);
    modal.appendChild(btnRow);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    input.focus();
    input.select();

    // Entree pour valider
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnApply.disabled) btnApply.click();
      if (e.key === 'Escape') overlay.remove();
    });
  }

  function swapSelected() {
    if (!selectedFile || !selectedSide) return;

    if (selectedSide === 'online') {
      const idx = onlineList.findIndex(g => g.file === selectedFile);
      if (idx !== -1) {
        offlineList.push(onlineList.splice(idx, 1)[0]);
        offlineList.sort((a, b) => a.file.localeCompare(b.file));
      }
    } else {
      const idx = offlineList.findIndex(g => g.file === selectedFile);
      if (idx !== -1) {
        onlineList.push(offlineList.splice(idx, 1)[0]);
      }
    }

    selectedFile = null;
    selectedSide = null;
    renderLists();
    updateApplyButton();
  }

  function hasChanges() {
    const currentOnline = onlineList.map(g => g.file);
    if (currentOnline.length !== originalOnline.length) return true;
    return currentOnline.some((f, i) => f !== originalOnline[i]);
  }

  function updateApplyButton() {
    const btn = document.getElementById('btn-site-apply');
    if (hasChanges()) {
      btn.disabled = false;
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-disabled');
    } else {
      btn.disabled = true;
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-disabled');
    }
  }

  async function applyChanges() {
    if (!hasChanges()) return;

    const btn = document.getElementById('btn-site-apply');
    const oldText = btn.textContent;
    btn.textContent = 'Application en cours...';
    btn.disabled = true;

    try {
      const result = await api('/api/site/apply', {
        method: 'POST',
        body: { online: onlineList.map(g => g.file) },
      });

      originalOnline = onlineList.map(g => g.file);
      updateApplyButton();

      const msgEl = document.getElementById('site-status');
      msgEl.textContent = result.message || 'Changements appliques';
      msgEl.className = 'site-status success';
      setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'site-status'; }, 4000);
    } catch (e) {
      const msgEl = document.getElementById('site-status');
      msgEl.textContent = 'Erreur: ' + e.message;
      msgEl.className = 'site-status error';
    } finally {
      btn.textContent = oldText;
    }
  }

  return { init, onActivate };
})();
