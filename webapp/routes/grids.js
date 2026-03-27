const express = require('express');
const router = express.Router();
const db = require('../db');

// Lister les grilles
router.get('/', (req, res) => {
  res.json(db.listGrids());
});

// Charger une grille
router.get('/:name', (req, res) => {
  const grid = db.loadGrid(req.params.name);
  if (!grid) return res.status(404).json({ error: 'Grille introuvable' });
  res.json(grid);
});

// Sauvegarder une grille
router.post('/', (req, res) => {
  const { name, data, terminee } = req.body;
  if (!name || !data) return res.status(400).json({ error: 'name et data requis' });
  db.saveGrid(name, data, !!terminee);
  res.json({ success: true });
});

// Supprimer une grille
router.delete('/:name', (req, res) => {
  db.deleteGrid(req.params.name);
  res.json({ success: true });
});

module.exports = router;
