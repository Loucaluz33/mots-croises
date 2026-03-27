/**
 * Éditeur de grille — Canvas2D avec navigation clavier, outils, undo.
 * Port de GridWidget + EditorTab de main.py.
 */

const CELL_SIZE = 44;
const HEADER_SIZE = 30;
const BLACK_COLOR = '#1a1a2e';
const WHITE_COLOR = '#ffffff';
const SELECTED_COLOR = '#b4d2ff';
const HIGHLIGHT_COLOR = '#dcebff';
const PERSONAL_HIGHLIGHT = '#fff0c8';
const HEADER_BG = '#f0f2f5';
const HEADER_TEXT = '#4a6cf7';
const NUMBER_COLOR = '#646464';
const LETTER_COLOR = '#1e1e1e';
const GRID_LINE_COLOR = '#8c8c8c';

const GridEditor = (() => {
  let canvas, ctx;
  let rows = 10, cols = 10;
  let gridData = [];
  let selected = null; // [r, c]
  let direction = 'across';
  let highlightedCells = [];
  let currentTool = 'letter';
  let blackLocked = false;
  let previewMap = null; // Map<"r,c", letter> pour la preview des suggestions
  let lockedPreviewWord = null;
  let symmetry = false;
  let numberingStyle = 'european'; // 'european' or 'american'
  let rowNumbering = 'roman';      // 'roman', 'arabic', 'alpha'
  let colNumbering = 'arabic';     // 'roman', 'arabic', 'alpha'
  let useSuffixes = true;
  let dottedFirst = null; // première case pour l'outil pointillés
  let clues = { across: {}, down: {} };
  let undoStack = [];
  const MAX_UNDO = 100;
  let modified = false;
  let currentGridName = '';

  function init() {
    canvas = document.getElementById('grid-canvas');
    ctx = canvas.getContext('2d');

    // Toolbar events
    document.getElementById('grid-rows').addEventListener('change', onSizeChange);
    document.getElementById('grid-cols').addEventListener('change', onSizeChange);
    document.getElementById('btn-new-grid').addEventListener('click', newGrid);
    document.getElementById('btn-save-grid').addEventListener('click', saveGrid);
    document.getElementById('btn-load-grid').addEventListener('click', loadGrid);
    document.getElementById('btn-numbering').addEventListener('click', openNumberingModal);
    document.getElementById('btn-export-json').addEventListener('click', exportJson);
    document.getElementById('symmetry-check').addEventListener('change', e => { symmetry = e.target.checked; });

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => onToolClick(btn.dataset.tool));
    });

    // Canvas events
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('keydown', onKeyDown);

    // Clic ailleurs dans l'onglet = déverrouiller
    document.getElementById('tab-editor').addEventListener('click', (e) => {
      if (!e.target.closest('.suggestion-word')) {
        unlockPreview();
        SuggestionPanel.clearSelection();
      }
    });

    // Créer la grille initiale
    createGrid(rows, cols);
  }

  function onActivate() {
    render();
    canvas.focus();
  }

  // ========== GRILLE ==========

  function createGrid(r, c) {
    rows = r; cols = c;
    gridData = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push({ black: false, letter: '', number: 0, dotted: null });
      }
      gridData.push(row);
    }
    selected = null;
    highlightedCells = [];
    clues = { across: {}, down: {} };
    undoStack = [];
    modified = false;
    currentGridName = '';
    autoNumber();
    resizeCanvas();
    render();
    CluePanel.update(clues, gridData, rows, cols);
    SuggestionPanel.clear();
  }

  function resizeCanvas() {
    const offset = (numberingStyle === 'european' ? HEADER_SIZE : 0);
    const w = offset + cols * CELL_SIZE + 1;
    const h = offset + rows * CELL_SIZE + 1;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function onSizeChange() {
    const r = parseInt(document.getElementById('grid-rows').value) || 10;
    const c = parseInt(document.getElementById('grid-cols').value) || 10;
    if (r >= 3 && r <= 25 && c >= 3 && c <= 25) {
      createGrid(r, c);
    }
  }

  function newGrid() {
    if (modified && !confirm('Grille modifiée. Créer une nouvelle grille ?')) return;
    const r = parseInt(document.getElementById('grid-rows').value) || 10;
    const c = parseInt(document.getElementById('grid-cols').value) || 10;
    createGrid(r, c);
  }

  // ========== TOOLS ==========

  function onToolClick(tool) {
    if (tool === 'black' && currentTool === 'black') {
      // Already in black mode: toggle lock
      blackLocked = !blackLocked;
      updateBlackBtnLabel();
      return;
    }
    setTool(tool);
  }

  function setTool(tool) {
    currentTool = tool;
    blackLocked = false;
    dottedFirst = null;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tool-btn[data-tool="${tool}"]`).classList.add('active');
    updateBlackBtnLabel();
  }

  function updateBlackBtnLabel() {
    const btn = document.querySelector('.tool-btn[data-tool="black"]');
    btn.classList.toggle('locked', currentTool === 'black' && blackLocked);
  }

  // ========== RENDERING ==========

  function render() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Headers background
    if (numberingStyle === 'european') {
      ctx.fillStyle = HEADER_BG;
      ctx.fillRect(0, 0, w, HEADER_SIZE);
      ctx.fillRect(0, 0, HEADER_SIZE, h);

      // Column headers (1, 2, 3...)
      ctx.fillStyle = HEADER_TEXT;
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let c = 0; c < cols; c++) {
        const x = HEADER_SIZE + c * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillText(getLabel(c + 1, colNumbering), x, HEADER_SIZE / 2);
      }

      // Row headers (I, II, III...)
      for (let r = 0; r < rows; r++) {
        const y = HEADER_SIZE + r * CELL_SIZE + CELL_SIZE / 2;
        const label = getLabel(r + 1, rowNumbering);
        ctx.font = `bold ${label.length > 3 ? 9 : 11}px -apple-system, sans-serif`;
        ctx.fillText(label, HEADER_SIZE / 2, y);
      }
    }

    // Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offset = (numberingStyle === 'european' ? HEADER_SIZE : 0);
        const x = offset + c * CELL_SIZE;
        const y = offset + r * CELL_SIZE;
        const cell = gridData[r][c];

        // Background
        if (cell.black) {
          ctx.fillStyle = BLACK_COLOR;
        } else if (selected && selected[0] === r && selected[1] === c) {
          ctx.fillStyle = SELECTED_COLOR;
        } else if (highlightedCells.some(([hr, hc]) => hr === r && hc === c)) {
          ctx.fillStyle = HIGHLIGHT_COLOR;
        } else {
          ctx.fillStyle = WHITE_COLOR;
        }
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        // Grid lines
        ctx.strokeStyle = GRID_LINE_COLOR;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

        if (!cell.black) {
          // Number
          if (numberingStyle === 'american' && cell.number > 0) {
            ctx.fillStyle = NUMBER_COLOR;
            ctx.font = '9px -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(String(cell.number), x + 2, y + 2);
          }

          // Letter (or preview)
          const preview = previewMap && previewMap.get(r * 100 + c);
          if (cell.letter) {
            ctx.fillStyle = LETTER_COLOR;
            ctx.font = 'bold 20px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.letter, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1);
          } else if (preview) {
            ctx.fillStyle = lockedPreviewWord ? '#4a6cf7' : '#c0c0c0';
            ctx.font = 'bold 20px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(preview, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1);
          }

          // Dotted borders
          const dotted = cell.dotted;
          if (dotted) {
            ctx.strokeStyle = '#4a6cf7';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            if (dotted.top) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + CELL_SIZE, y); ctx.stroke(); }
            if (dotted.bottom) { ctx.beginPath(); ctx.moveTo(x, y + CELL_SIZE); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); ctx.stroke(); }
            if (dotted.left) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + CELL_SIZE); ctx.stroke(); }
            if (dotted.right) { ctx.beginPath(); ctx.moveTo(x + CELL_SIZE, y); ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE); ctx.stroke(); }
            ctx.setLineDash([]);
          }
        }
      }
    }

    // Dotted first selection indicator
    if (dottedFirst) {
      const [dr, dc] = dottedFirst;
      const x = HEADER_SIZE + dc * CELL_SIZE;
      const y = HEADER_SIZE + dr * CELL_SIZE;
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
  }

  // ========== MOUSE ==========

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const offset = (numberingStyle === 'european' ? HEADER_SIZE : 0);
    const c = Math.floor((mx - offset) / CELL_SIZE);
    const r = Math.floor((my - offset) / CELL_SIZE);
    if (r >= 0 && r < rows && c >= 0 && c < cols) return [r, c];
    return null;
  }

  function onMouseDown(e) {
    const cell = cellFromEvent(e);
    if (lockedPreviewWord) {
      unlockPreview();
      SuggestionPanel.clearSelection();
    }
    if (!cell) return;
    canvas.focus();
    const [r, c] = cell;

    if (currentTool === 'black') {
      toggleBlack(r, c);
      if (!blackLocked) setTool('letter');
    } else if (currentTool === 'dotted') {
      handleDottedClick(r, c);
    } else {
      // letter tool
      if (selected && selected[0] === r && selected[1] === c) {
        // Re-clic sur la même case → toggle direction
        direction = direction === 'across' ? 'down' : 'across';
      }
      selectCell(r, c);
    }
  }

  function onDoubleClick(e) {
    // Double-clic en mode lettre ne fait rien de spécial ici
    // (le toggle direction est déjà géré par le re-clic)
  }

  function selectCell(r, c, dir) {
    if (gridData[r][c].black) return;
    if (dir) direction = dir;
    selected = [r, c];
    updateHighlight();
    render();
    CluePanel.highlightClue(r, c, direction);
    SuggestionPanel.onCellSelected(r, c, direction, gridData, rows, cols);
  }

  // ========== HIGHLIGHT ==========

  function updateHighlight() {
    highlightedCells = [];
    if (!selected) return;
    const cells = getWordCells(selected[0], selected[1], direction);
    highlightedCells = cells;
  }

  function getWordCells(r, c, dir) {
    if (gridData[r][c].black) return [];
    const cells = [];
    if (dir === 'across') {
      // Trouver le début du mot
      let startC = c;
      while (startC > 0 && !gridData[r][startC - 1].black) startC--;
      // Trouver la fin
      let endC = c;
      while (endC < cols - 1 && !gridData[r][endC + 1].black) endC++;
      for (let i = startC; i <= endC; i++) cells.push([r, i]);
    } else {
      let startR = r;
      while (startR > 0 && !gridData[startR - 1][c].black) startR--;
      let endR = r;
      while (endR < rows - 1 && !gridData[endR + 1][c].black) endR++;
      for (let i = startR; i <= endR; i++) cells.push([i, c]);
    }
    return cells;
  }

  // Cases depuis (r,c) vers la droite/bas jusqu'à case noire ou bord
  function getCellsFromSelected(r, c, dir) {
    if (gridData[r][c].black) return [];
    const cells = [];
    if (dir === 'across') {
      let endC = c;
      while (endC < cols - 1 && !gridData[r][endC + 1].black) endC++;
      for (let i = c; i <= endC; i++) cells.push([r, i]);
    } else {
      let endR = r;
      while (endR < rows - 1 && !gridData[endR + 1][c].black) endR++;
      for (let i = r; i <= endR; i++) cells.push([i, c]);
    }
    return cells;
  }

  // ========== BLACK CELLS ==========

  function toggleBlack(r, c) {
    saveUndoState();
    gridData[r][c].black = !gridData[r][c].black;
    gridData[r][c].letter = '';
    gridData[r][c].number = 0;

    // Symétrie
    if (symmetry) {
      const sr = rows - 1 - r;
      const sc = cols - 1 - c;
      if (sr !== r || sc !== c) {
        gridData[sr][sc].black = gridData[r][c].black;
        gridData[sr][sc].letter = '';
        gridData[sr][sc].number = 0;
      }
    }

    modified = true;
    autoNumber();
    render();
    CluePanel.update(clues, gridData, rows, cols);
    SuggestionPanel.clear();
  }

  // ========== DOTTED BORDERS ==========

  function handleDottedClick(r, c) {
    if (gridData[r][c].black) return;

    if (!dottedFirst) {
      dottedFirst = [r, c];
      render();
      return;
    }

    const [r1, c1] = dottedFirst;
    dottedFirst = null;

    // Vérifier adjacence
    const dr = r - r1, dc = c - c1;
    if (Math.abs(dr) + Math.abs(dc) !== 1) { render(); return; }

    // Toggle la bordure entre les deux cases
    ensureDotted(r1, c1);
    ensureDotted(r, c);

    if (dr === -1) { // cell est au-dessus de first
      gridData[r1][c1].dotted.top = !gridData[r1][c1].dotted.top;
      gridData[r][c].dotted.bottom = gridData[r1][c1].dotted.top;
    } else if (dr === 1) {
      gridData[r1][c1].dotted.bottom = !gridData[r1][c1].dotted.bottom;
      gridData[r][c].dotted.top = gridData[r1][c1].dotted.bottom;
    } else if (dc === -1) {
      gridData[r1][c1].dotted.left = !gridData[r1][c1].dotted.left;
      gridData[r][c].dotted.right = gridData[r1][c1].dotted.left;
    } else if (dc === 1) {
      gridData[r1][c1].dotted.right = !gridData[r1][c1].dotted.right;
      gridData[r][c].dotted.left = gridData[r1][c1].dotted.right;
    }

    modified = true;
    render();
  }

  function ensureDotted(r, c) {
    if (!gridData[r][c].dotted) {
      gridData[r][c].dotted = { top: false, bottom: false, left: false, right: false };
    }
  }

  // ========== KEYBOARD ==========

  function onKeyDown(e) {
    // Ctrl+Z = undo (toujours disponible, même sans sélection)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    if (!selected) return;
    const [r, c] = selected;

    // Lettres A-Z
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (currentTool !== 'letter') setTool('letter');
      saveUndoState();
      gridData[r][c].letter = e.key.toUpperCase();
      modified = true;
      // Avancer dans la direction courante
      advanceCursor();
      autoNumber();
      render();
      CluePanel.update(clues, gridData, rows, cols);
      SuggestionPanel.onCellSelected(selected[0], selected[1], direction, gridData, rows, cols);
      return;
    }

    // Espace = toggle direction
    if (e.key === ' ') {
      e.preventDefault();
      direction = direction === 'across' ? 'down' : 'across';
      updateHighlight();
      render();
      CluePanel.highlightClue(r, c, direction);
      SuggestionPanel.onCellSelected(r, c, direction, gridData, rows, cols);
      return;
    }

    // Backspace = effacer et reculer
    if (e.key === 'Backspace') {
      e.preventDefault();
      saveUndoState();
      if (gridData[r][c].letter) {
        gridData[r][c].letter = '';
      } else {
        // Reculer
        retreatCursor();
        if (selected) gridData[selected[0]][selected[1]].letter = '';
      }
      modified = true;
      autoNumber();
      render();
      CluePanel.update(clues, gridData, rows, cols);
      SuggestionPanel.onCellSelected(selected[0], selected[1], direction, gridData, rows, cols);
      return;
    }

    // Delete = effacer sans bouger
    if (e.key === 'Delete') {
      e.preventDefault();
      saveUndoState();
      gridData[r][c].letter = '';
      modified = true;
      render();
      CluePanel.update(clues, gridData, rows, cols);
      return;
    }

    // Flèches
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      let nr = r, nc = c;
      if (e.key === 'ArrowUp') nr = Math.max(0, r - 1);
      if (e.key === 'ArrowDown') nr = Math.min(rows - 1, r + 1);
      if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1);
      if (e.key === 'ArrowRight') nc = Math.min(cols - 1, c + 1);
      if (nr !== r || nc !== c) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') direction = 'across';
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') direction = 'down';
        selectCell(nr, nc);
      }
      return;
    }

    // Tab = avancer au prochain mot
    if (e.key === 'Tab') {
      e.preventDefault();
      direction = direction === 'across' ? 'down' : 'across';
      updateHighlight();
      render();
      return;
    }
  }

  function advanceCursor() {
    if (!selected) return;
    let [r, c] = selected;
    if (direction === 'across') {
      c++;
      while (c < cols && gridData[r][c].black) c++;
      if (c < cols) selected = [r, c];
    } else {
      r++;
      while (r < rows && gridData[r][c].black) r++;
      if (r < rows) selected = [r, c];
    }
    updateHighlight();
  }

  function retreatCursor() {
    if (!selected) return;
    let [r, c] = selected;
    if (direction === 'across') {
      c--;
      while (c >= 0 && gridData[r][c].black) c--;
      if (c >= 0) selected = [r, c];
    } else {
      r--;
      while (r >= 0 && gridData[r][c].black) r--;
      if (r >= 0) selected = [r, c];
    }
    updateHighlight();
  }

  // ========== AUTO-NUMBERING (French) ==========

  function autoNumber() {
    const oldClues = JSON.parse(JSON.stringify(clues));
    clues = { across: {}, down: {} };

    // Reset numbers
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        gridData[r][c].number = 0;

    let num = 1;
    // Assign numbers to cells that start a word (American style logic always pre-calculates this)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (gridData[r][c].black) continue;
        const startsH = (c === 0 || gridData[r][c - 1].black) && c + 1 < cols && !gridData[r][c + 1].black;
        const startsV = (r === 0 || gridData[r - 1][c].black) && r + 1 < rows && !gridData[r + 1][c].black;
        if (startsH || startsV) {
          gridData[r][c].number = num++;
        }
      }
    }

    if (numberingStyle === 'european') {
      // Horizontal
      for (let r = 0; r < rows; r++) {
        const wordsInRow = [];
        let c = 0;
        while (c < cols) {
          if (!gridData[r][c].black) {
            const startC = c;
            while (c < cols && !gridData[r][c].black) c++;
            if (c - startC >= 2) wordsInRow.push(startC);
          } else { c++; }
        }

        const labelBase = getLabel(r + 1, rowNumbering);
        if (wordsInRow.length === 0) continue;

        if (!useSuffixes) {
          const key = labelBase;
          const mergedClue = wordsInRow.map(col => findOldClue(oldClues.across, r, col)).filter(Boolean).join(' - ');
          clues.across[key] = { label: key, row: r, col: wordsInRow[0], clue: mergedClue };
        } else if (wordsInRow.length === 1) {
          const key = labelBase;
          const oldClue = findOldClue(oldClues.across, r, wordsInRow[0]);
          clues.across[key] = { label: key, row: r, col: wordsInRow[0], clue: oldClue };
        } else {
          for (let i = 0; i < wordsInRow.length; i++) {
            const suffix = String.fromCharCode(97 + i);
            const key = `${labelBase}.${suffix}`;
            const oldClue = findOldClue(oldClues.across, r, wordsInRow[i]);
            clues.across[key] = { label: key, row: r, col: wordsInRow[i], clue: oldClue };
          }
        }
      }

      // Vertical
      for (let c = 0; c < cols; c++) {
        const wordsInCol = [];
        let r = 0;
        while (r < rows) {
          if (!gridData[r][c].black) {
            const startR = r;
            while (r < rows && !gridData[r][c].black) r++;
            if (r - startR >= 2) wordsInCol.push(startR);
          } else { r++; }
        }

        const labelBase = getLabel(c + 1, colNumbering);
        if (wordsInCol.length === 0) continue;

        if (!useSuffixes) {
          const key = labelBase;
          const mergedClue = wordsInCol.map(row => findOldClue(oldClues.down, row, c)).filter(Boolean).join(' - ');
          clues.down[key] = { label: key, row: wordsInCol[0], col: c, clue: mergedClue };
        } else if (wordsInCol.length === 1) {
          const key = labelBase;
          const oldClue = findOldClue(oldClues.down, wordsInCol[0], c);
          clues.down[key] = { label: key, row: wordsInCol[0], col: c, clue: oldClue };
        } else {
          for (let i = 0; i < wordsInCol.length; i++) {
            const suffix = String.fromCharCode(97 + i);
            const key = `${labelBase}.${suffix}`;
            const oldClue = findOldClue(oldClues.down, wordsInCol[i], c);
            clues.down[key] = { label: key, row: wordsInCol[i], col: c, clue: oldClue };
          }
        }
      }
    } else {
      // American style: unique number for each starting cell
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (gridData[r][c].black) continue;
          const num = gridData[r][c].number;
          if (!num) continue;

          // Check if it's the start of an across word
          if ((c === 0 || gridData[r][c - 1].black) && c + 1 < cols && !gridData[r][c + 1].black) {
            const key = String(num);
            const oldClue = findOldClue(oldClues.across, r, c);
            clues.across[key] = { label: key, row: r, col: c, clue: oldClue };
          }
          // Check if it's the start of a down word
          if ((r === 0 || gridData[r - 1][c].black) && r + 1 < rows && !gridData[r + 1][c].black) {
            const key = String(num);
            const oldClue = findOldClue(oldClues.down, r, c);
            clues.down[key] = { label: key, row: r, col: c, clue: oldClue };
          }
        }
      }
    }
  }

  function findOldClue(oldDir, r, c) {
    for (const v of Object.values(oldDir)) {
      if (v.row === r && v.col === c) return v.clue || '';
    }
    return '';
  }

  // ========== UNDO ==========

  function saveUndoState() {
    const state = gridData.map(row => row.map(cell => ({
      letter: cell.letter, black: cell.black,
      dotted: cell.dotted ? { across: cell.dotted.across, down: cell.dotted.down } : null
    })));
    undoStack.push(state);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function undo() {
    if (undoStack.length === 0) return;
    const state = undoStack.pop();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        gridData[r][c].letter = state[r][c].letter;
        gridData[r][c].black = state[r][c].black;
        gridData[r][c].dotted = state[r][c].dotted;
      }
    }
    modified = true;
    autoNumber();
    render();
    CluePanel.update(clues, gridData, rows, cols);
    if (selected) {
      SuggestionPanel.onCellSelected(selected[0], selected[1], direction, gridData, rows, cols);
    }
  }

  // ========== WORD HELPERS ==========

  function getWord(r, c, dir) {
    const cells = getWordCells(r, c, dir);
    return cells.map(([cr, cc]) => gridData[cr][cc].letter || ' ').join('');
  }

  // ========== SAVE / LOAD / EXPORT ==========

  async function saveGrid() {
    let name = currentGridName || prompt('Nom de la grille :');
    if (!name) return;
    currentGridName = name;
    const data = buildExportData();
    try {
      await api('/api/grids', { method: 'POST', body: { name, data } });
      modified = false;
      showToast('Grille sauvegardée');
    } catch (e) {
      showToast('Erreur : ' + e.message, true);
    }
  }

  async function loadGrid() {
    if (modified && !confirm('Grille modifiee. Charger une autre grille ?')) return;
    try {
      const grids = await api('/api/grids');
      if (grids.length === 0) { alert('Aucune grille sauvegardee.'); return; }

      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      let listHtml = grids.map(g => `<div class="load-grid-item" data-name="${esc(g.nom)}">${esc(g.nom)}</div>`).join('');

      overlay.innerHTML = `
        <div class="modal" style="max-width:450px;display:flex;flex-direction:column;max-height:70vh">
          <h3>Charger une grille</h3>
          <input type="text" id="load-grid-search" placeholder="Rechercher..." style="width:100%;padding:8px 12px;border:1px solid #cdd5e0;border-radius:6px;font-size:14px;margin-bottom:8px;box-sizing:border-box">
          <div id="load-grid-list" style="flex:1;overflow-y:auto;min-height:0;border:1px solid #e0e4ed;border-radius:6px">${listHtml}</div>
          <div class="modal-actions" style="margin-top:12px">
            <button class="btn" id="load-grid-cancel">Annuler</button>
            <button class="btn" id="load-grid-ok" disabled style="background:#ccc;color:#fff;cursor:default">Charger</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const searchInput = overlay.querySelector('#load-grid-search');
      const listContainer = overlay.querySelector('#load-grid-list');
      const okBtn = overlay.querySelector('#load-grid-ok');
      let selectedName = null;

      function filterList() {
        const q = searchInput.value.trim().toLowerCase();
        const items = listContainer.querySelectorAll('.load-grid-item');
        if (!q) {
          items.forEach(el => { el.style.display = ''; el.style.order = '0'; });
          return;
        }
        items.forEach(el => {
          const name = el.dataset.name.toLowerCase();
          if (name.startsWith(q)) {
            el.style.display = '';
            el.style.order = '0';
          } else if (name.includes(q)) {
            el.style.display = '';
            el.style.order = '1';
          } else {
            el.style.display = 'none';
          }
        });
        // Re-sort visible items by order
        const parent = listContainer;
        const sorted = Array.from(items).filter(el => el.style.display !== 'none');
        sorted.sort((a, b) => (parseInt(a.style.order) || 0) - (parseInt(b.style.order) || 0));
        sorted.forEach(el => parent.appendChild(el));
      }

      function selectItem(name) {
        listContainer.querySelectorAll('.load-grid-item').forEach(el => {
          el.classList.toggle('selected', el.dataset.name === name);
        });
        selectedName = name;
        okBtn.disabled = false;
        okBtn.style.background = '#4a6cf7';
        okBtn.style.cursor = 'pointer';
      }

      searchInput.addEventListener('input', () => {
        filterList();
        // Deselect if selected item is now hidden
        if (selectedName) {
          const sel = listContainer.querySelector(`.load-grid-item.selected`);
          if (sel && sel.style.display === 'none') {
            sel.classList.remove('selected');
            selectedName = null;
            okBtn.disabled = true;
            okBtn.style.background = '#ccc';
            okBtn.style.cursor = 'default';
          }
        }
      });

      listContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.load-grid-item');
        if (item) selectItem(item.dataset.name);
      });

      listContainer.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.load-grid-item');
        if (item) {
          selectItem(item.dataset.name);
          okBtn.click();
        }
      });

      overlay.querySelector('#load-grid-cancel').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && selectedName) {
          e.preventDefault();
          okBtn.click();
        }
      });

      okBtn.addEventListener('click', async () => {
        if (!selectedName) return;
        try {
          const result = await api(`/api/grids/${encodeURIComponent(selectedName)}`);
          overlay.remove();
          loadFromData(result.json_data);
          currentGridName = selectedName;
          modified = false;
        } catch (err) {
          alert('Erreur : ' + err.message);
        }
      });

      searchInput.focus();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  function openNumberingModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:450px">
        <h3>Style de numérotation</h3>
        <div class="form-group">
          <label><input type="radio" name="num-style" value="european" ${numberingStyle === 'european' ? 'checked' : ''}> Européenne</label>
        </div>
        <div id="european-options" style="margin-left:24px; display:${numberingStyle === 'european' ? 'block' : 'none'}">
          <div class="form-group">
            <label>Lignes :</label>
            <select id="row-num-type" style="width:auto; margin-left:8px">
              <option value="roman" ${rowNumbering === 'roman' ? 'selected' : ''}>I, II, III (Romains)</option>
              <option value="arabic" ${rowNumbering === 'arabic' ? 'selected' : ''}>1, 2, 3 (Arabes)</option>
              <option value="alpha" ${rowNumbering === 'alpha' ? 'selected' : ''}>A, B, C (Alpha)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Colonnes :</label>
            <select id="col-num-type" style="width:auto; margin-left:8px">
              <option value="roman" ${colNumbering === 'roman' ? 'selected' : ''}>I, II, III (Romains)</option>
              <option value="arabic" ${colNumbering === 'arabic' ? 'selected' : ''}>1, 2, 3 (Arabes)</option>
              <option value="alpha" ${colNumbering === 'alpha' ? 'selected' : ''}>A, B, C (Alpha)</option>
            </select>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="use-suffixes" ${useSuffixes ? 'checked' : ''}> Utiliser des suffixes (.a, .b) pour les mots multiples</label>
          </div>
        </div>
        <div class="form-group" style="margin-top:12px">
          <label><input type="radio" name="num-style" value="american" ${numberingStyle === 'american' ? 'checked' : ''}> Américaine (Numéros dans les cases)</label>
        </div>
        <div class="modal-actions">
          <button class="btn" id="btn-num-cancel">Annuler</button>
          <button class="btn btn-primary" id="btn-num-ok">Valider</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const styleRadios = overlay.querySelectorAll('input[name="num-style"]');
    styleRadios.forEach(r => r.addEventListener('change', () => {
      overlay.querySelector('#european-options').style.display = (r.value === 'european' ? 'block' : 'none');
    }));

    overlay.querySelector('#btn-num-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btn-num-ok').addEventListener('click', () => {
      const selectedStyle = overlay.querySelector('input[name="num-style"]:checked').value;
      const selectedRow = overlay.querySelector('#row-num-type').value;
      const selectedCol = overlay.querySelector('#col-num-type').value;
      const selectedSuffixes = overlay.querySelector('#use-suffixes').checked;

      if (selectedStyle !== numberingStyle || selectedRow !== rowNumbering || selectedCol !== colNumbering || selectedSuffixes !== useSuffixes) {
        numberingStyle = selectedStyle;
        rowNumbering = selectedRow;
        colNumbering = selectedCol;
        useSuffixes = selectedSuffixes;
        autoNumber();
        resizeCanvas();
        render();
        CluePanel.update(clues, gridData, rows, cols);
        modified = true;
      }
      overlay.remove();
    });
  }

  function exportJson() {
    const data = buildExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentGridName || 'grille') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildExportData() {
    const data = {
      format: 'verbicruciste',
      version: 2,
      style: numberingStyle === 'american' ? 'american' : 'french',
      numberingStyle: numberingStyle,
      rowNumbering: rowNumbering,
      colNumbering: colNumbering,
      useSuffixes: useSuffixes,
      title: currentGridName || 'Sans titre',
      author: '',
      date: '',
      size: { rows, cols },
      grid: gridData.map(row => row.map(cell => {
        const obj = { black: cell.black, letter: cell.letter || '', number: cell.number || 0 };
        if (cell.dotted && Object.values(cell.dotted).some(v => v)) obj.dotted = cell.dotted;
        return obj;
      })),
      clues: {
        across: Object.values(clues.across).map(c => ({
          label: c.label, clue: c.clue || '',
          row: c.row, col: c.col,
          answer: getWord(c.row, c.col, 'across').trim(),
          length: getWord(c.row, c.col, 'across').trimEnd().length,
        })),
        down: Object.values(clues.down).map(c => ({
          label: c.label, clue: c.clue || '',
          row: c.row, col: c.col,
          answer: getWord(c.row, c.col, 'down').trim(),
          length: getWord(c.row, c.col, 'down').trimEnd().length,
        }))
      }
    };
    return data;
  }

  function loadFromData(data) {
    rows = data.size.rows;
    cols = data.size.cols;
    numberingStyle = data.numberingStyle || (data.style === 'american' ? 'american' : 'european');
    rowNumbering = data.rowNumbering || 'roman';
    colNumbering = data.colNumbering || 'arabic';
    useSuffixes = data.useSuffixes !== undefined ? data.useSuffixes : true;
    document.getElementById('grid-rows').value = rows;
    document.getElementById('grid-cols').value = cols;
    resizeCanvas();

    gridData = data.grid.map(row => row.map(cell => ({
      black: cell.black,
      letter: cell.letter || '',
      number: cell.number || 0,
      dotted: cell.dotted || null,
    })));

    // Charger les clues
    clues = { across: {}, down: {} };
    for (const c of (data.clues?.across || [])) {
      const key = c.label || String(c.number || '');
      clues.across[key] = { label: key, row: c.row, col: c.col, clue: c.clue || '' };
    }
    for (const c of (data.clues?.down || [])) {
      const key = c.label || String(c.number || '');
      clues.down[key] = { label: key, row: c.row, col: c.col, clue: c.clue || '' };
    }

    selected = null;
    highlightedCells = [];
    undoStack = [];
    autoNumber();
    resizeCanvas();
    render();
    CluePanel.update(clues, gridData, rows, cols);
    SuggestionPanel.clear();
  }

  // ========== INSERT SUGGESTION ==========

  function insertWord(word) {
    if (lockedPreviewWord) {
      unlockPreview();
      SuggestionPanel.clearSelection();
    }
    if (!selected) return;
    const [r, c] = selected;
    if (gridData[r][c].black) return;
    // Insérer à partir de la cellule sélectionnée
    const cells = getCellsFromSelected(r, c, direction);
    if (!cells.length) return;
    const upper = word.toUpperCase();
    if (upper.length > cells.length) return;

    saveUndoState();
    for (let i = 0; i < upper.length; i++) {
      gridData[cells[i][0]][cells[i][1]].letter = upper[i];
    }
    modified = true;
    autoNumber();
    render();
    CluePanel.update(clues, gridData, rows, cols);
    SuggestionPanel.onCellSelected(selected[0], selected[1], direction, gridData, rows, cols);
    canvas.focus();
  }

  function previewWord(word) {
    if (lockedPreviewWord && lockedPreviewWord !== word.toUpperCase()) return;
    if (!selected) return;
    const [r, c] = selected;
    if (gridData[r][c].black) return;
    const cells = getCellsFromSelected(r, c, direction);
    if (!cells.length) return;
    const upper = word.toUpperCase();
    if (upper.length > cells.length) { clearPreview(); return; }
    previewMap = new Map();
    for (let i = 0; i < upper.length; i++) {
      const [cr, cc] = cells[i];
      if (!gridData[cr][cc].letter) {
        previewMap.set(cr * 100 + cc, upper[i]);
      }
    }
    render();
  }

  function clearPreview() {
    if (lockedPreviewWord) return;
    if (!previewMap) return;
    previewMap = null;
    render();
  }

  function lockPreview(word) {
    lockedPreviewWord = word.toUpperCase();
    previewWord(word);
    render();
  }

  function unlockPreview() {
    if (!lockedPreviewWord) return;
    lockedPreviewWord = null;
    previewMap = null;
    render();
  }

  function showToast(msg, isError) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', top: '12px', left: '12px', zIndex: '9999',
      background: isError ? '#e74c3c' : '#323232', color: '#fff',
      padding: '8px 16px', borderRadius: '6px', fontSize: '13px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      opacity: '0', transition: 'opacity 0.2s'
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 1500);
  }

  // ========== PUBLIC API ==========

  return {
    init,
    onActivate,
    render,
    selectCell,
    getWordCells,
    getCellsFromSelected,
    getWord,
    insertWord,
    previewWord,
    clearPreview,
    lockPreview,
    unlockPreview,
    setTool,
    get gridData() { return gridData; },
    get clues() { return clues; },
    get selected() { return selected; },
    get direction() { return direction; },
    get rows() { return rows; },
    get cols() { return cols; },
    set clueText({ direction: dir, key, text }) {
      if (clues[dir] && clues[dir][key]) {
        clues[dir][key].clue = text;
        modified = true;
      }
    },
  };
})();
