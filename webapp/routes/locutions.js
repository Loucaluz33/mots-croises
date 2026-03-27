const express = require('express');
const router = express.Router();
const db = require('../db');

// Recherche paginée avec filtre catégories
router.get('/', (req, res) => {
  const { search, limit, offset, categories, searchIn } = req.query;
  const cats = categories ? categories.split(',').filter(Boolean) : null;
  const fields = searchIn ? searchIn.split(',').filter(f => ['expression', 'definition'].includes(f)) : ['expression'];
  res.json(db.searchLocutions(search || '', parseInt(limit) || 200, parseInt(offset) || 0, cats, fields));
});

// Compteur
router.get('/count', (req, res) => {
  res.json({ count: db.getLocutionsCount() });
});

// Catégories disponibles
router.get('/categories', (req, res) => {
  res.json(db.getLocutionsCategories());
});

// Random
router.get('/random', (req, res) => {
  const count = parseInt(req.query.count) || 10;
  res.json(db.randomLocutions(count));
});

// Téléchargement (SSE)
router.post('/download', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (msg) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', message: msg })}\n\n`);
  };

  db.downloadLocutions(sendProgress)
    .then(total => {
      res.write(`data: ${JSON.stringify({ type: 'done', total })}\n\n`);
      res.end();
    })
    .catch(err => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });
});

module.exports = router;
