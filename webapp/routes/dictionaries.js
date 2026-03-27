const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');

// Lister les dictionnaires personnels
router.get('/', (req, res) => {
  res.json(db.getPersonalDicts());
});

// Créer un dictionnaire personnel
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const id = db.addPersonalDict(name);
  if (id === null) return res.status(409).json({ error: 'Nom déjà utilisé' });
  res.json({ id });
});

// Renommer un dictionnaire personnel
router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const success = db.renamePersonalDict(parseInt(req.params.id), name);
  if (!success) return res.status(400).json({ error: 'Échec du renommage' });
  res.json({ success: true });
});

// Supprimer un dictionnaire personnel
router.delete('/:id', (req, res) => {
  const success = db.deletePersonalDict(parseInt(req.params.id));
  if (!success) return res.status(400).json({ error: 'Impossible de supprimer le dictionnaire par défaut' });
  res.json({ success: true });
});

// Browse un dictionnaire (personnel, lexique ou externe)
router.get('/browse/:source', (req, res) => {
  const { search, limit } = req.query;
  const result = db.browseDictionary(req.params.source, search || '', parseInt(limit) || 0);
  res.json(result);
});

// Lister les mots d'un dictionnaire personnel
router.get('/:id/words', (req, res) => {
  const { search, limit } = req.query;
  const words = db.getPersonalWords(search || '', parseInt(limit) || 500, parseInt(req.params.id));
  res.json(words);
});

// Obtenir un mot spécifique
router.get('/:id/words/:word', (req, res) => {
  const word = db.getPersonalWord(req.params.word, parseInt(req.params.id));
  if (!word) return res.status(404).json({ error: 'Mot introuvable' });
  res.json(word);
});

// Ajouter un mot
router.post('/:id/words', (req, res) => {
  const { mot, definitions, categorie, notes } = req.body;
  if (!mot) return res.status(400).json({ error: 'mot requis' });
  const result = db.addPersonalWord(mot, definitions || [], categorie || '', notes || '', parseInt(req.params.id));
  if (result === false) return res.status(409).json({ error: 'Mot déjà existant' });
  if (result === null) return res.status(500).json({ error: 'Erreur DB' });
  res.json({ success: true });
});

// Modifier un mot
router.put('/:id/words/:word', (req, res) => {
  const { definitions, categorie, notes, newMot } = req.body;
  db.updatePersonalWord(req.params.word, { definitions, categorie, notes, newMot }, parseInt(req.params.id));
  res.json({ success: true });
});

// Supprimer un mot
router.delete('/:id/words/:word', (req, res) => {
  db.deletePersonalWord(req.params.word, parseInt(req.params.id));
  res.json({ success: true });
});

// Exporter un dictionnaire en JSON
router.get('/:id/export', (req, res) => {
  const dictId = parseInt(req.params.id);
  const name = db.getPersonalDictName(dictId);
  const tmpPath = path.join(db.DB_DIR, `_export_${dictId}.json`);
  try {
    const count = db.exportPersonalDictionary(tmpPath, dictId);
    const content = fs.readFileSync(tmpPath, 'utf-8');
    fs.unlinkSync(tmpPath);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${name || 'dictionnaire'}.json"`);
    res.send(content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Importer un dictionnaire depuis JSON
router.post('/:id/import', (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data requis (contenu JSON)' });
  try {
    // Écrire dans un fichier temporaire puis importer
    const tmpPath = path.join(db.DB_DIR, `_import_${Date.now()}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
    const count = db.importPersonalDictionary(tmpPath, parseInt(req.params.id));
    fs.unlinkSync(tmpPath);
    res.json({ success: true, imported: count });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Catégories existantes par fréquence décroissante
router.get('/categories', (req, res) => {
  res.json(db.getCategories());
});

module.exports = router;
