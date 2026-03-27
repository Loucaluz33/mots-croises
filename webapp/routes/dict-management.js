const express = require('express');
const router = express.Router();
const db = require('../db');

// Paramètres des dictionnaires
router.get('/settings', (req, res) => {
  res.json(db.getDictSettings());
});

// Activer/désactiver une source
router.put('/settings/:source', (req, res) => {
  const { enabled } = req.body;
  db.setSourceEnabled(req.params.source, !!enabled);
  res.json({ success: true });
});

// Statistiques
router.get('/stats', (req, res) => {
  const lexique = db.getLexiqueStats();
  const personal = db.getPersonalStats();
  const external = {};
  for (const source of Object.keys(db.EXTERNAL_DICTS)) {
    external[source] = db.getExternalCount(source);
  }
  // Stats par dico perso
  const personalDicts = db.getPersonalDicts();
  const personalByDict = {};
  for (const pd of personalDicts) {
    personalByDict[pd.id] = db.getPersonalStats(pd.id);
  }
  res.json({ lexique, personal, external, personalByDict, personalDicts });
});

// Info dictionnaires externes
router.get('/external-dicts', (req, res) => {
  res.json(db.EXTERNAL_DICTS);
});

// Groupes de filtres
router.get('/groups', (req, res) => {
  res.json(db.getDictGroups());
});

router.post('/groups', (req, res) => {
  const { name, sources } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const id = db.addDictGroup(name, sources || []);
  res.json({ id });
});

router.put('/groups/:id', (req, res) => {
  const { name, sources } = req.body;
  db.updateDictGroup(parseInt(req.params.id), name, sources);
  res.json({ success: true });
});

router.delete('/groups/:id', (req, res) => {
  db.deleteDictGroup(parseInt(req.params.id));
  res.json({ success: true });
});

// Téléchargement d'un dictionnaire externe (SSE pour le progrès)
router.post('/download/:source', (req, res) => {
  const source = req.params.source;
  const downloadFn = db.DOWNLOAD_FUNCTIONS[source];
  if (!downloadFn) return res.status(400).json({ error: `Source inconnue : ${source}` });

  // SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (msg) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', message: msg })}\n\n`);
  };

  downloadFn(sendProgress)
    .then(total => {
      res.write(`data: ${JSON.stringify({ type: 'done', total })}\n\n`);
      res.end();
    })
    .catch(err => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });

  req.on('close', () => {
    // Client déconnecté — le download continue en arrière-plan
  });
});

// Renommer un dictionnaire externe
router.put('/rename/:source', (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'label requis' });
  db.renameExternalDict(req.params.source, label);
  res.json({ success: true });
});

// Supprimer un dictionnaire externe ou lexique
router.delete('/delete-source/:source', (req, res) => {
  const source = req.params.source;
  try {
    db.deleteExternalSource(source);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
