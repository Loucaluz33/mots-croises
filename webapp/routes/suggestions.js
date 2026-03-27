const express = require('express');
const router = express.Router();
const db = require('../db');

// Recherche par pattern groupée
router.get('/search', (req, res) => {
  const { pattern, sources } = req.query;
  if (!pattern) return res.status(400).json({ error: 'pattern requis' });
  const onlySources = sources ? sources.split(',').filter(Boolean) : null;
  const results = db.searchByPatternGrouped(pattern, onlySources);
  res.json(results);
});

module.exports = router;
