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

    // Trier les clés
    const keys = Object.keys(clueDir).sort((a, b) => {
      return clueKeySort(a, direction) - clueKeySort(b, direction);
    });

    for (const key of keys) {
      const c = clueDir[key];
      const word = getWordFromGrid(c.row, c.col, direction, gridData, rows, cols);
      const displayWord = word.replace(/ /g, '\u00B7');

      const item = document.createElement('div');
      item.className = 'clue-item';
      item.dataset.dir = direction;
      item.dataset.key = key;

      // Label
      const label = document.createElement('span');
      label.className = 'clue-label';
      label.textContent = c.label;
      label.addEventListener('click', () => {
        GridEditor.selectCell(c.row, c.col, direction);
      });

      // Input définition
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'clue-text';
      input.value = c.clue || '';
      input.placeholder = 'Définition...';
      input.addEventListener('change', () => {
        GridEditor.clueText = { direction, key, text: input.value };
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

      // Bouton S (save to personal)
      const saveBtn = document.createElement('button');
      saveBtn.className = 'clue-save-btn';
      saveBtn.textContent = 'S';
      saveBtn.title = 'Sauvegarder dans le dictionnaire personnel';

      const trimmedWord = word.trim();
      const hasSpaces = trimmedWord.includes(' ');
      const hasClue = (c.clue || '').trim().length > 0;
      if (!trimmedWord || hasSpaces || !hasClue) {
        saveBtn.classList.add('hidden');
      }

      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api(`/api/dictionaries/${AppState.currentDictId}/words`, {
            method: 'POST',
            body: { mot: trimmedWord, definitions: [c.clue.trim()], categorie: '', notes: '' }
          });
          alert(`"${trimmedWord}" ajouté au dictionnaire personnel.`);
          saveBtn.classList.add('hidden');
        } catch (err) {
          if (err.message.includes('existant')) {
            // Le mot existe déjà, essayer d'ajouter la définition
            try {
              const existing = await api(`/api/dictionaries/${AppState.currentDictId}/words/${encodeURIComponent(trimmedWord)}`);
              const defs = existing.definitions ? JSON.parse(existing.definitions) : [];
              if (!defs.includes(c.clue.trim())) {
                defs.push(c.clue.trim());
                await api(`/api/dictionaries/${AppState.currentDictId}/words/${encodeURIComponent(trimmedWord)}`, {
                  method: 'PUT',
                  body: { definitions: defs }
                });
                alert(`Définition ajoutée à "${trimmedWord}".`);
              } else {
                alert(`La définition est déjà présente pour "${trimmedWord}".`);
              }
              saveBtn.classList.add('hidden');
            } catch (e2) {
              alert('Erreur : ' + e2.message);
            }
          } else {
            alert('Erreur : ' + err.message);
          }
        }
      });

      item.appendChild(label);
      item.appendChild(input);
      item.appendChild(wordSpan);
      item.appendChild(saveBtn);
      el.appendChild(item);
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
        const el = document.querySelector(`.clue-item[data-dir="${dir}"][data-key="${key}"]`);
        if (el) {
          el.classList.add('active');
          el.scrollIntoView({ block: 'nearest' });
        }
        break;
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
