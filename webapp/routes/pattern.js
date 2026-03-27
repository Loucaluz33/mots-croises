const express = require('express');
const router = express.Router();
const db = require('../db');

// Search by pattern
router.get('/search', (req, res) => {
  const { pattern, sources } = req.query;
  if (!pattern || pattern.length < 2) return res.json([]);
  const sourceList = sources ? sources.split(',').filter(Boolean) : null;
  res.json(db.searchByPatternFlat(pattern, sourceList));
});

// List all available sources
router.get('/sources', (req, res) => {
  res.json(db.getAllSources());
});

module.exports = router;
