const express = require('express');
const router = express.Router();
const db = require('../db');

// Liste enrichie des grilles (métadonnées extraites du JSON)
router.get('/', (req, res) => {
  const grids = db.listGridsFull();
  const enriched = grids.map(g => {
    let meta = {};
    try {
      const data = JSON.parse(g.json_data || '{}');
      meta = {
        title: data.title || g.nom,
        author: data.author || '',
        size: data.size || null,
        onlineName: data.onlineName || '',
        difficulty: data.difficulty || '',
        theme: data.theme || '',
      };
      // Mini-grille (juste black/letter pour la miniature)
      if (data.grid) {
        meta.miniGrid = data.grid.map(row =>
          row.map(cell => ({ b: cell.black ? 1 : 0, l: cell.letter || '' }))
        );
      }
    } catch (e) { /* ignore parse errors */ }
    return {
      id: g.id,
      nom: g.nom,
      terminee: g.terminee,
      date_creation: g.date_creation,
      date_modif: g.date_modif,
      ...meta,
    };
  });
  res.json(enriched);
});

// Mettre à jour les métadonnées d'une grille
router.put('/:name/meta', (req, res) => {
  const grid = db.loadGrid(req.params.name);
  if (!grid) return res.status(404).json({ error: 'Grille introuvable' });
  const data = grid.json_data;
  const { difficulty, theme } = req.body;
  if (difficulty !== undefined) data.difficulty = difficulty;
  if (theme !== undefined) data.theme = theme;
  db.saveGrid(req.params.name, data, !!grid.terminee);
  res.json({ success: true });
});

module.exports = router;
