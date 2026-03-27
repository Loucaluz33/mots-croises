const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { search } = req.query;
  res.json(db.getMemos(search || ''));
});

router.post('/', (req, res) => {
  const { mot, dict_target, categorie, note } = req.body;
  if (!mot && !dict_target && !note) return res.status(400).json({ error: 'Au moins un champ requis' });
  const result = db.addMemo(mot, dict_target, categorie, note);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { mot, dict_target, categorie, note } = req.body;
  if (!mot && !dict_target && !note) return res.status(400).json({ error: 'Au moins un champ requis' });
  db.updateMemo(parseInt(req.params.id), mot, dict_target, categorie, note);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.deleteMemo(parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
