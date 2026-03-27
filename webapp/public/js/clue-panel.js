/**
 * Panneau de définitions — Horizontalement / Verticalement.
 * Port de CluePanel de main.py.
 */

const CluePanel = (() => {
  let acrossEl, downEl;

  function init() {
    acrossEl = document.getElementById('clues-across');
    downEl = document.getElementById('clues-down');
  }

  function update(clues, gridData, rows, cols) {
    renderColumn(acrossEl, 'Horizontalement', clues.across, 'across', gridData, rows, cols);
    renderColumn(downEl, 'Verticalement', clues.down, 'down', gridData, rows, cols);
  }

  function renderColumn(el, title, clueDir, direction, gridData, rows, cols) {
    el.innerHTML = `<h3>${title}</h3>`;

    // Regrouper par label (pour gérer les subClues sans suffixe)
    const grouped = {};
    for (const key of Object.keys(clueDir)) {
      const c = clueDir[key];
      if (!grouped[c.label]) grouped[c.label] = [];
      grouped[c.label].push({ key, ...c });
    }

    // Trier les labels
    const labels = Object.keys(grouped).sort((a, b) => {
      // On utilise la première clé du groupe pour le tri
      return clueKeySort(grouped[a][0].key, direction) - clueKeySort(grouped[b][0].key, direction);
    });

    for (const labelText of labels) {
      const group = grouped[labelText];
      const item = document.createElement('div');
      item.className = 'clue-item';
      item.dataset.dir = direction;
      // Pour le highlight, on garde une trace de toutes les clés
      item.dataset.keys = group.map(g => g.key).join(',');

      // Label
      const labelEl = document.createElement('span');
      labelEl.className = 'clue-label';
      labelEl.textContent = labelText;
      labelEl.addEventListener('click', () => {
        GridEditor.selectCell(group[0].row, group[0].col, direction);
      });
      item.appendChild(labelEl);

      // Pour chaque mot du groupe
      group.forEach((c, index) => {
        const word = getWordFromGrid(c.row, c.col, direction, gridData, rows, cols);
        const displayWord = word.replace(/ /g, '\u00B7');

        // Input définition
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'clue-text';
        input.value = c.clue || '';
        input.placeholder = group.length > 1 ? `Définition ${index + 1}...` : 'Définition...';
        input.style.flex = "1";
        input.addEventListener('change', () => {
          GridEditor.clueText = { direction, key: c.key, text: input.value };
        });
        input.addEventListener('focus', () => {
          GridEditor.selectCell(c.row, c.col, direction);
        });

        // Mot
        const isComplete = !word.includes(' ');
        const wordSpan = document.createElement('span');
        wordSpan.className = 'clue-word' + (isComplete ? ' complete' : '');
        wordSpan.textContent = displayWord;
        wordSpan.style.cursor = 'pointer';
        wordSpan.addEventListener('click', () => {
          GridEditor.selectCell(c.row, c.col, direction);
        });

        // Bouton S
        const saveBtn = document.createElement('button');
        saveBtn.className = 'clue-save-btn';
        saveBtn.textContent = 'S';
        const trimmedWord = word.trim();
        const hasSpaces = trimmedWord.includes(' ');
        const hasClue = (c.clue || '').trim().length > 0;
        if (!trimmedWord || hasSpaces || !hasClue) saveBtn.classList.add('hidden');

        saveBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // ... (logique de sauvegarde identique)
          saveWordToPersonal(trimmedWord, c.clue.trim(), saveBtn);
        });

        item.appendChild(input);
        if (group.length > 1 && index < group.length - 1) {
          const sep = document.createElement('span');
          sep.textContent = ' - ';
          sep.style.color = '#ccc';
          item.appendChild(sep);
        }
        item.appendChild(wordSpan);
        item.appendChild(saveBtn);
      });

      el.appendChild(item);
    }
  }

  async function saveWordToPersonal(word, clue, btn) {
    try {
      await api(`/api/dictionaries/${AppState.currentDictId}/words`, {
        method: 'POST',
        body: { mot: word, definitions: [clue], categorie: '', notes: '' }
      });
      alert(`"${word}" ajouté au dictionnaire personnel.`);
      btn.classList.add('hidden');
    } catch (err) {
      if (err.message.includes('existant')) {
        try {
          const existing = await api(`/api/dictionaries/${AppState.currentDictId}/words/${encodeURIComponent(word)}`);
          const defs = existing.definitions ? JSON.parse(existing.definitions) : [];
          if (!defs.includes(clue)) {
            defs.push(clue);
            await api(`/api/dictionaries/${AppState.currentDictId}/words/${encodeURIComponent(word)}`, {
              method: 'PUT',
              body: { definitions: defs }
            });
            alert(`Définition ajoutée à "${word}".`);
          } else {
            alert(`La définition est déjà présente pour "${word}".`);
          }
          btn.classList.add('hidden');
        } catch (e2) { alert('Erreur : ' + e2.message); }
      } else { alert('Erreur : ' + err.message); }
    }
  }

  function highlightClue(r, c, dir) {
    // Retirer l'ancien highlight
    document.querySelectorAll('.clue-item.active').forEach(el => el.classList.remove('active'));
    // Trouver la clue correspondante
    const clues = GridEditor.clues;
    for (const [key, clue] of Object.entries(clues[dir])) {
      const cells = GridEditor.getWordCells(clue.row, clue.col, dir);
      if (cells.some(([cr, cc]) => cr === r && cc === c)) {
        // Chercher l'élément qui contient cette clé dans son dataset.keys
        const items = document.querySelectorAll(`.clue-item[data-dir="${dir}"]`);
        for (const item of items) {
          const keys = (item.dataset.keys || '').split(',');
          if (keys.includes(key)) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
            return;
          }
        }
      }
    }
  }

  // ========== HELPERS ==========

  function getWordFromGrid(r, c, dir, gridData, rows, cols) {
    const cells = [];
    if (dir === 'across') {
      let cc = c;
      while (cc < cols && !gridData[r][cc].black) {
        cells.push(gridData[r][cc].letter || ' ');
        cc++;
      }
    } else {
      let rr = r;
      while (rr < rows && !gridData[rr][c].black) {
        cells.push(gridData[rr][c].letter || ' ');
        rr++;
      }
    }
    return cells.join('');
  }

  function clueKeySort(key, direction) {
    // Parse "III.a" → [3, 0] or "12.b" → [12, 1]
    const parts = key.split('.');
    let num;
    if (direction === 'across') {
      num = romanToInt(parts[0]);
    } else {
      num = parseInt(parts[0]) || 0;
    }
    const suffix = parts[1] ? parts[1].charCodeAt(0) - 96 : 0;
    return num * 100 + suffix;
  }

  function romanToInt(s) {
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let result = 0;
    for (let i = 0; i < s.length; i++) {
      const val = map[s[i]] || 0;
      const next = map[s[i + 1]] || 0;
      result += val < next ? -val : val;
    }
    return result;
  }

  return { init, update, highlightClue };
})();
