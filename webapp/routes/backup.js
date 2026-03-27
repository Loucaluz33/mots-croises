const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', (req, res) => {
  const backupPath = db.backupDb();
  if (backupPath) {
    res.json({ success: true, path: backupPath });
  } else {
    res.status(500).json({ error: 'Échec du backup' });
  }
});

module.exports = router;
