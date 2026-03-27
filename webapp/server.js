const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));

// Routes API
app.use('/api/grids', require('./routes/grids'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/dictionaries', require('./routes/dictionaries'));
app.use('/api/dict-management', require('./routes/dict-management'));
app.use('/api/locutions', require('./routes/locutions'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/pattern', require('./routes/pattern'));
app.use('/api/memos', require('./routes/memos'));
app.use('/api/site', require('./routes/site-management'));
app.use('/api/grid-management', require('./routes/grid-management'));

// Démarrage
async function start() {
  console.log('Backup de la base de données...');
  const backupPath = db.backupDb();
  if (backupPath) console.log(`Backup : ${backupPath}`);

  console.log('Initialisation de la base...');
  db.initDb();

  const stats = db.getLexiqueStats();
  console.log(`Lexique : ${stats.distinct_words} mots distincts (${stats.total_entries} entrées)`);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Verbicruciste webapp : http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Erreur au démarrage:', err);
  process.exit(1);
});

// Fermeture propre
process.on('SIGINT', () => { db.closeDb(); process.exit(0); });
process.on('SIGTERM', () => { db.closeDb(); process.exit(0); });
