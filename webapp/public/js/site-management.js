/**
 * Module Gestion Site — gere les grilles online/offline du site joueur.
 * Drag & drop pour reordonner les grilles online (multi-selection avec Cmd).
 * Clic + bouton swap pour deplacer entre online/offline.
 * Double-clic sur une ligne pour modifier le NomOnline.
 */
const SiteManagement = (() => {
  let onlineList = [];
  let offlineList = [];
  let originalOnline = [];
  let selectedFiles = new Set(); // multi-selection
  let selectedSide = null;

  // Undo history (snapshots of onlineList/offlineList)
  let undoStack = [];

  function saveSnapshot() {
    undoStack.push({
      online: onlineList.map(g => ({ ...g })),
      offline: offlineList.map(g => ({ ...g })),
    });
  }

  function undo() {
    if (!undoStack.length) return;
    const snapshot = undoStack.pop();
    onlineList = snapshot.online;
    offlineList = snapshot.offline;
    selectedFiles.clear();
    selectedSide = null;
    renderLists();
    updateApplyButton();
  }

  // Drag state
  let dragFiles = [];
  let dragOverIdx = -1;
  let autoScrollRAF = null;
  let autoScrollContainer = null;
  let lastDragY = 0;

  // Auto-scroll pendant le drag quand le curseur est pres des bords
  function startAutoScroll(container) {
    autoScrollContainer = container;
    document.addEventListener('dragover', trackDragY);
    autoScrollLoop();
  }

  function stopAutoScroll() {
    document.removeEventListener('dragover', trackDragY);
    if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
    autoScrollContainer = null;
  }

  function trackDragY(e) {
    lastDragY = e.clientY;
  }

  function autoScrollLoop() {
    if (!autoScrollContainer) return;
    const rect = autoScrollContainer.getBoundingClientRect();
    const edgeZone = 40; // px depuis le bord pour declencher le scroll
    const speed = 6;
    if (lastDragY < rect.top + edgeZone && lastDragY > rect.top - 20) {
      autoScrollContainer.scrollTop -= speed;
    } else if (lastDragY > rect.bottom - edgeZone && lastDragY < rect.bottom + 20) {
      autoScrollContainer.scrollTop += speed;
    }
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  }

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
      undoStack = [];
      selectedFiles.clear();
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
      if (selectedFiles.has(g.file) && side === selectedSide) {
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
      colOnline.className = 'site-col site-col-online';
      colOnline.textContent = g.onlineName || g.title;

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

      // Clic = selection (Cmd pour multi-select)
      item.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey) {
          // Multi-select: toggle dans la meme liste
          if (selectedSide !== side) {
            selectedFiles.clear();
            selectedSide = side;
          }
          if (selectedFiles.has(g.file)) {
            selectedFiles.delete(g.file);
            if (selectedFiles.size === 0) selectedSide = null;
          } else {
            selectedFiles.add(g.file);
          }
        } else {
          // Simple clic
          if (selectedFiles.size === 1 && selectedFiles.has(g.file) && selectedSide === side) {
            selectedFiles.clear();
            selectedSide = null;
          } else {
            selectedFiles.clear();
            selectedFiles.add(g.file);
            selectedSide = side;
          }
        }
        renderLists();
      });

      // Double-clic = editer NomOnline
      item.addEventListener('dblclick', (e) => {
        e.preventDefault();
        openOnlineNameModal(g);
      });

      // Drag & drop uniquement pour la liste online
      if (side === 'online') {
        item.draggable = true;

        item.addEventListener('dragstart', (e) => {
          // Si l'item dragged fait partie de la selection, on drag toute la selection
          if (selectedFiles.has(g.file) && selectedSide === 'online') {
            dragFiles = onlineList.filter(x => selectedFiles.has(x.file)).map(x => x.file);
          } else {
            // Selectionner cet item sans re-render (sinon le DOM est reconstruit et le drag casse)
            dragFiles = [g.file];
            selectedFiles.clear();
            selectedFiles.add(g.file);
            selectedSide = 'online';
            // Mise a jour visuelle sans reconstruire le DOM
            container.querySelectorAll('.site-item').forEach(el => {
              el.classList.toggle('selected', el.dataset.file === g.file);
            });
          }
          // Image de drag invisible (les lignes ne bougent pas visuellement)
          const ghost = document.createElement('div');
          ghost.style.width = '1px';
          ghost.style.height = '1px';
          ghost.style.opacity = '0.01';
          ghost.style.position = 'absolute';
          ghost.style.top = '-9999px';
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 0, 0);
          setTimeout(() => ghost.remove(), 0);
          e.dataTransfer.effectAllowed = 'move';
          // Demarrer l'auto-scroll
          startAutoScroll(container);
        });

        item.addEventListener('dragend', () => {
          stopAutoScroll();
          dragFiles = [];
          dragOverIdx = -1;
          renderLists();
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          // Ne pas afficher l'indicateur sur les items qu'on drag
          if (dragFiles.includes(g.file)) return;
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
          stopAutoScroll();
          if (!dragFiles.length) return;
          if (dragFiles.length === 1 && dragFiles[0] === g.file) return;
          // Ne pas dropper sur un item qu'on drag
          if (dragFiles.includes(g.file)) return;

          saveSnapshot();
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const insertBefore = e.clientY < midY;

          const movedItems = [];
          const remaining = [];
          for (const ol of onlineList) {
            if (dragFiles.includes(ol.file)) {
              movedItems.push(ol);
            } else {
              remaining.push(ol);
            }
          }

          let toIdx = remaining.findIndex(x => x.file === g.file);
          if (toIdx === -1) return;
          if (!insertBefore) toIdx++;

          remaining.splice(toIdx, 0, ...movedItems);
          onlineList = remaining;

          dragFiles = [];
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

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnApply.disabled) btnApply.click();
      if (e.key === 'Escape') overlay.remove();
    });
  }

  function swapSelected() {
    if (!selectedFiles.size || !selectedSide) return;

    saveSnapshot();
    if (selectedSide === 'online') {
      const toMove = onlineList.filter(g => selectedFiles.has(g.file));
      onlineList = onlineList.filter(g => !selectedFiles.has(g.file));
      offlineList.push(...toMove);
      offlineList.sort((a, b) => a.file.localeCompare(b.file));
    } else {
      const toMove = offlineList.filter(g => selectedFiles.has(g.file));
      offlineList = offlineList.filter(g => !selectedFiles.has(g.file));
      onlineList.push(...toMove);
    }

    selectedFiles.clear();
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
      undoStack = [];
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

  return { init, onActivate, undo };
})();
