/**
 * Routes pour la gestion du site joueur.html
 * Tous les fichiers (JSON, joueur.html, index.html) sont a la racine du repo.
 * GitHub Pages sert directement depuis la racine.
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_DIR = path.resolve(__dirname, '..', '..');
const INDEX_HTML = path.join(REPO_DIR, 'index.html');

function readGrilleMeta(f) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(REPO_DIR, f), 'utf-8'));
    return {
      file: f,
      title: (data.title && data.title !== 'Sans titre') ? data.title : f.replace('.json', ''),
      onlineName: data.onlineName || data.title || f.replace('.json', ''),
      author: data.author || '',
      size: data.size || null,
    };
  } catch {
    return { file: f, title: f.replace('.json', ''), onlineName: f.replace('.json', ''), author: '', size: null };
  }
}

/** Git add + commit + push */
function gitPush(files, message) {
  try {
    const fileArgs = files.map(f => `"${f}"`).join(' ');
    execSync(`git add ${fileArgs}`, { cwd: REPO_DIR, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: REPO_DIR, encoding: 'utf-8' });
    if (status.trim()) {
      execSync(`git commit -m "${message}"`, { cwd: REPO_DIR, stdio: 'pipe' });
      execSync('git push', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 });
      return 'Changements push sur GitHub';
    }
    return 'Aucun changement a commiter';
  } catch (gitErr) {
    return 'Fichiers mis a jour localement, erreur git: ' + gitErr.message;
  }
}

/**
 * GET /api/site/grilles
 */
router.get('/grilles', (req, res) => {
  try {
    // Lister les JSON de grilles a la racine du repo
    const allFiles = fs.readdirSync(REPO_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('.') && f !== 'package.json' && f !== 'package-lock.json');

    // Lire index.html pour trouver les grilles online (dans l'ordre)
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    const match = html.match(/const grids = \[([\s\S]*?)\];/);
    const onlineFiles = [];
    if (match) {
      const re = /file:\s*'([^']+)'/g;
      let m;
      while ((m = re.exec(match[1])) !== null) {
        onlineFiles.push(m[1]);
      }
    }

    const grilles = allFiles.map(f => readGrilleMeta(f));

    const online = onlineFiles
      .map(f => grilles.find(g => g.file === f))
      .filter(Boolean);
    const offline = grilles.filter(g => !onlineFiles.includes(g.file));

    res.json({ online, offline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/site/apply
 * Body: { online: ['MK.json', 'MK2.json', ...] }
 */
router.post('/apply', (req, res) => {
  try {
    const { online } = req.body;
    if (!Array.isArray(online)) {
      return res.status(400).json({ error: 'online doit etre un tableau' });
    }

    // Mettre a jour index.html
    let html = fs.readFileSync(INDEX_HTML, 'utf-8');
    const entries = online.map(f => `  { file: '${f}' }`).join(',\n');
    const newBlock = `const grids = [\n${entries}\n];`;
    html = html.replace(/const grids = \[[\s\S]*?\];/, newBlock);
    fs.writeFileSync(INDEX_HTML, html, 'utf-8');

    const gitFiles = ['index.html'].concat(online);
    const gitResult = gitPush(gitFiles, `Mise a jour grilles site: ${online.join(', ')}`);

    res.json({ success: true, message: gitResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/site/online-name
 * Body: { file: 'MK.json', onlineName: 'Nouveau nom' }
 */
router.put('/online-name', (req, res) => {
  try {
    const { file, onlineName } = req.body;
    if (!file || typeof onlineName !== 'string') {
      return res.status(400).json({ error: 'file et onlineName requis' });
    }

    const filePath = path.join(REPO_DIR, file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier non trouve' });
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    data.onlineName = onlineName.trim();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    const gitResult = gitPush([file], `Renommage online: ${file} -> ${onlineName.trim()}`);

    res.json({ success: true, onlineName: data.onlineName, message: gitResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
