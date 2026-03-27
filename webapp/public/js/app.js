/**
 * App principale — routeur d'onglets et initialisation.
 */

// État global
const AppState = {
  currentTab: 'editor',
  currentDictId: 1,
};

// ========== TAB SWITCHING ==========
const tabActivateCallbacks = {
  'dict-editor': () => DictEditor.onActivate(),
  'dict-mgmt': () => DictManagement.onActivate(),
  'locutions': () => Locutions.onActivate(),
  'pattern': () => PatternSearch.onActivate(),
  'memo': () => Memo.onActivate(),
  'editor': () => GridEditor.onActivate(),
  'grid-mgmt': () => GridManagement.onActivate(),
  'site-mgmt': () => SiteManagement.onActivate(),
};

function switchToTab(tab) {
  if (tab === AppState.currentTab) return;
  document.querySelector('.tab-bar button.active')?.classList.remove('active');
  document.querySelector('.tab-content.active')?.classList.remove('active');
  const btn = document.querySelector(`.tab-bar button[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  AppState.currentTab = tab;
  if (tabActivateCallbacks[tab]) tabActivateCallbacks[tab]();
}

document.querySelector('.tab-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-bar button');
  if (!btn || btn.classList.contains('tab-dragging')) return;
  switchToTab(btn.dataset.tab);
});

// ========== TAB DRAG & DROP ==========
(() => {
  const tabBar = document.querySelector('.tab-bar');
  const STORAGE_KEY = 'verbicruciste-tab-order';
  let dragBtn = null;

  // Restore saved order on load
  restoreTabOrder();

  function saveTabOrder() {
    const order = [...tabBar.querySelectorAll('button')].map(b => b.dataset.tab);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }

  function restoreTabOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved)) return;
      const buttons = [...tabBar.querySelectorAll('button')];
      const btnMap = {};
      buttons.forEach(b => { btnMap[b.dataset.tab] = b; });
      // Only reorder if all tabs match
      if (saved.length !== buttons.length) return;
      if (!saved.every(t => btnMap[t])) return;
      saved.forEach(t => tabBar.appendChild(btnMap[t]));
    } catch (e) { /* ignore */ }
  }

  tabBar.querySelectorAll('button').forEach(btn => {
    btn.draggable = true;

    btn.addEventListener('dragstart', (e) => {
      dragBtn = btn;
      btn.classList.add('tab-dragging');
      // Ghost invisible — on montre l'indicateur à la place
      const ghost = document.createElement('div');
      ghost.style.cssText = 'width:1px;height:1px;opacity:0.01;position:absolute;top:-9999px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => ghost.remove(), 0);
      e.dataTransfer.effectAllowed = 'move';
    });

    btn.addEventListener('dragend', () => {
      dragBtn = null;
      btn.classList.remove('tab-dragging');
      tabBar.querySelectorAll('button').forEach(b => b.classList.remove('tab-drop-left', 'tab-drop-right'));
    });

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragBtn || dragBtn === btn) return;
      tabBar.querySelectorAll('button').forEach(b => b.classList.remove('tab-drop-left', 'tab-drop-right'));
      const rect = btn.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        btn.classList.add('tab-drop-left');
      } else {
        btn.classList.add('tab-drop-right');
      }
    });

    btn.addEventListener('dragleave', () => {
      btn.classList.remove('tab-drop-left', 'tab-drop-right');
    });

    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragBtn || dragBtn === btn) return;
      const rect = btn.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertBefore = e.clientX < midX;

      if (insertBefore) {
        tabBar.insertBefore(dragBtn, btn);
      } else {
        tabBar.insertBefore(dragBtn, btn.nextSibling);
      }

      tabBar.querySelectorAll('button').forEach(b => b.classList.remove('tab-drop-left', 'tab-drop-right'));
      dragBtn.classList.remove('tab-dragging');
      dragBtn = null;
      saveTabOrder();
    });
  });
})();

// ========== CTRL+Z UNDO TRANSFER ==========
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((AppState.currentTab === 'memo' || AppState.currentTab === 'dict-editor') && TransferUndo.hasUndo()) {
      e.preventDefault();
      TransferUndo.undo();
    }
    if (AppState.currentTab === 'site-mgmt') {
      e.preventDefault();
      SiteManagement.undo();
    }
  }
});

// ========== INIT ==========
async function init() {
  // Charger les stats pour la barre de status
  try {
    const stats = await api('/api/dict-management/stats');
    const parts = [];
    if (stats.lexique) parts.push(`Lexique: ${stats.lexique.distinct_words} mots`);
    if (stats.personal) parts.push(`Personnel: ${stats.personal.total_words} mots`);
    for (const [src, count] of Object.entries(stats.external || {})) {
      if (count > 0) parts.push(`${src}: ${count}`);
    }
    document.getElementById('status-bar').textContent = parts.join(' | ');
  } catch (e) {
    document.getElementById('status-bar').textContent = 'Erreur chargement stats';
    console.error('[init] stats error:', e);
  }

  // Initialiser les modules
  try {
    CluePanel.init();
    await SuggestionPanel.init();
    GridEditor.init();
    DictEditor.init();
    DictManagement.init();
    Locutions.init();
    PatternSearch.init();
    Memo.init();
    GridManagement.init();
    SiteManagement.init();
  } catch (e) {
    console.error('[init] error:', e.message, e.stack);
  }
}

init();
