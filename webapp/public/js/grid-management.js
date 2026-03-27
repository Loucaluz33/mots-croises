/**
 * Gestion Grilles — liste déroulante des grilles sauvegardées
 * avec vue liste (détails) ou vue miniatures.
 */
const GridManagement = (() => {
  let grids = [];
  let viewMode = 'list'; // 'list' ou 'thumbnails'
  let container, countEl;

  function init() {
    container = document.getElementById('grid-mgmt-container');
    countEl = document.getElementById('grid-mgmt-count');

    // Boutons de vue
    document.querySelectorAll('.grid-mgmt-view-toggle .view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.view === viewMode) return;
        document.querySelector('.grid-mgmt-view-toggle .view-btn.active').classList.remove('active');
        btn.classList.add('active');
        viewMode = btn.dataset.view;
        render();
      });
    });
  }

  async function onActivate() {
    try {
      grids = await api('/api/grid-management');
      render();
    } catch (e) {
      container.innerHTML = '<p style="color:#e74c3c;">Erreur chargement des grilles.</p>';
      console.error('[GridManagement]', e);
    }
  }

  function render() {
    countEl.textContent = `${grids.length} grille${grids.length > 1 ? 's' : ''}`;
    if (grids.length === 0) {
      container.innerHTML = '<p class="grid-mgmt-empty">Aucune grille sauvegardée.</p>';
      return;
    }
    if (viewMode === 'list') renderList();
    else renderThumbnails();
  }

  // ========== VUE LISTE ==========
  function renderList() {
    let html = `<div class="grid-mgmt-list">
      <div class="grid-mgmt-row grid-mgmt-row-header">
        <span class="gm-col gm-col-nom">Nom</span>
        <span class="gm-col gm-col-online">Nom Online</span>
        <span class="gm-col gm-col-size">Taille</span>
        <span class="gm-col gm-col-author">Auteur</span>
        <span class="gm-col gm-col-created">Création</span>
        <span class="gm-col gm-col-modified">Modification</span>
        <span class="gm-col gm-col-diff">Difficulté</span>
        <span class="gm-col gm-col-theme">Thématique</span>
      </div>`;
    for (const g of grids) {
      const sizeStr = g.size ? `${g.size.rows}×${g.size.cols}` : '—';
      const created = g.date_creation ? formatDate(g.date_creation) : '—';
      const modified = g.date_modif ? formatDate(g.date_modif) : '—';
      html += `<div class="grid-mgmt-row grid-mgmt-row-item" data-nom="${esc(g.nom)}">
        <span class="gm-col gm-col-nom" title="${esc(g.nom)}">${esc(g.title || g.nom)}</span>
        <span class="gm-col gm-col-online">${esc(g.onlineName || '—')}</span>
        <span class="gm-col gm-col-size">${sizeStr}</span>
        <span class="gm-col gm-col-author">${esc(g.author || '—')}</span>
        <span class="gm-col gm-col-created">${created}</span>
        <span class="gm-col gm-col-modified">${modified}</span>
        <span class="gm-col gm-col-diff">${esc(g.difficulty || '—')}</span>
        <span class="gm-col gm-col-theme">${esc(g.theme || '—')}</span>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // ========== VUE MINIATURES ==========
  function renderThumbnails() {
    let html = '<div class="grid-mgmt-thumbs">';
    for (const g of grids) {
      html += `<div class="grid-mgmt-thumb-card" data-nom="${esc(g.nom)}">
        <canvas class="grid-mgmt-thumb-canvas" data-grid-id="${g.id}"></canvas>
        <div class="grid-mgmt-thumb-name">${esc(g.title || g.nom)}</div>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;

    // Dessiner les miniatures sur les canvas
    grids.forEach(g => {
      const canvas = container.querySelector(`canvas[data-grid-id="${g.id}"]`);
      if (canvas && g.miniGrid) drawMiniGrid(canvas, g.miniGrid);
    });
  }

  function drawMiniGrid(canvas, miniGrid) {
    const rows = miniGrid.length;
    const cols = miniGrid[0] ? miniGrid[0].length : 0;
    if (!rows || !cols) return;

    const cellSize = Math.min(Math.floor(200 / Math.max(rows, cols)), 20);
    const w = cols * cellSize;
    const h = rows * cellSize;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = miniGrid[r][c];
        const x = c * cellSize;
        const y = r * cellSize;

        if (cell.b) {
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(x, y, cellSize, cellSize);
        } else {
          // Lettre
          if (cell.l) {
            ctx.fillStyle = '#1e1e1e';
            ctx.font = `bold ${Math.max(cellSize - 4, 8)}px -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.l, x + cellSize / 2, y + cellSize / 2 + 1);
          }
        }

        // Bordure
        ctx.strokeStyle = '#8c8c8c';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  // ========== UTILS ==========
  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  }

  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return { init, onActivate };
})();
