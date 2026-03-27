/**
 * Utilitaires partagés.
 */

// Conversion entier → chiffres romains
function toRoman(n) {
  const vals = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let result = '';
  for (const [val, numeral] of vals) {
    while (n >= val) { result += numeral; n -= val; }
  }
  return result;
}

// 1 -> A, 2 -> B... 27 -> AA
function toAlpha(n) {
  let s = "";
  while (n > 0) {
    let m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function getLabel(n, type) {
  if (type === 'roman') return toRoman(n);
  if (type === 'alpha') return toAlpha(n);
  return String(n);
}

// Supprime les accents
function stripAccents(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

// Normalise pour la grille : majuscules, sans accents, sans tirets/apostrophes
function normalizeForGrid(text) {
  return stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '');
}

// Debounce
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ========== TRANSFER UNDO ==========
const TransferUndo = (() => {
  const stack = [];

  function push(action) {
    stack.push(action);
    if (stack.length > 20) stack.shift();
  }

  async function undo() {
    const action = stack.pop();
    if (!action) return;
    try {
      if (action.type === 'memo-to-dict') {
        // Undo: delete word from dict, re-create memo
        await api(`/api/dictionaries/${action.dict.dictId}/words/${encodeURIComponent(action.dict.mot)}`, { method: 'DELETE' });
        await api('/api/memos', { method: 'POST', body: action.memo });
        if (AppState.currentTab === 'memo') Memo.loadMemos();
        if (AppState.currentTab === 'dict-editor') DictEditor.onActivate();
      } else if (action.type === 'dict-to-memo') {
        // Undo: delete memo (last created), re-add word to dict
        const memos = await api('/api/memos');
        const toDelete = memos.find(m => m.mot === action.memo.mot && m.dict_target === action.memo.dict_target);
        if (toDelete) await api(`/api/memos/${toDelete.id}`, { method: 'DELETE' });
        await api(`/api/dictionaries/${action.dict.dictId}/words`, {
          method: 'POST',
          body: { mot: action.dict.mot, definitions: action.dict.definitions, categorie: action.dict.categorie, notes: action.dict.notes }
        });
        if (AppState.currentTab === 'dict-editor') DictEditor.onActivate();
        if (AppState.currentTab === 'memo') Memo.loadMemos();
      }
    } catch (e) { alert('Erreur annulation : ' + e.message); }
  }

  function hasUndo() { return stack.length > 0; }

  return { push, undo, hasUndo };
})();

// Fetch API avec gestion d'erreur
async function api(url, options = {}) {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || resp.statusText);
  }
  return resp.json();
}
