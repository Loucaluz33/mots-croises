/**
 * Routes pour la gestion du site joueur.html
 * - Liste les grilles online/offline
 * - Applique les changements (met a jour index.html + git push)
 * - Met a jour le onlineName d'une grille
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_DIR = path.resolve(__dirname, '..', '..', 'site');
const INDEX_HTML = path.resolve(__dirname, '..', '..', 'index.html');
const REPO_DIR = path.resolve(__dirname, '..', '..');

function readGrilleMeta(f) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(SITE_DIR, f), 'utf-8'));
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

/**
 * GET /api/site/grilles
 * Retourne { online: [...], offline: [...] }
 */
router.get('/grilles', (req, res) => {
  try {
    const allFiles = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.json'));

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

    // Garder l'ordre d'index.html pour les online
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

    // Lire index.html
    let html = fs.readFileSync(INDEX_HTML, 'utf-8');

    // Reconstruire le bloc const grids = [...]
    const entries = online.map(f => `  { file: '${f}' }`).join(',\n');
    const newBlock = `const grids = [\n${entries}\n];`;
    html = html.replace(/const grids = \[[\s\S]*?\];/, newBlock);

    fs.writeFileSync(INDEX_HTML, html, 'utf-8');

    // Copier joueur.html depuis site/ vers la racine
    const joueurSrc = path.join(SITE_DIR, 'joueur.html');
    const joueurDst = path.join(REPO_DIR, 'joueur.html');
    if (fs.existsSync(joueurSrc)) {
      fs.copyFileSync(joueurSrc, joueurDst);
    }

    // Git add, commit, push
    let gitResult = '';
    try {
      execSync('git add index.html joueur.html site/', { cwd: REPO_DIR, stdio: 'pipe' });
      const status = execSync('git status --porcelain', { cwd: REPO_DIR, encoding: 'utf-8' });
      if (status.trim()) {
        const msg = `Mise a jour grilles site: ${online.join(', ')}`;
        execSync(`git commit -m "${msg}"`, { cwd: REPO_DIR, stdio: 'pipe' });
        execSync('git push', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 });
        gitResult = 'Changements push sur GitHub';
      } else {
        gitResult = 'Aucun changement a commiter';
      }
    } catch (gitErr) {
      gitResult = 'Fichiers mis a jour localement, mais erreur git: ' + gitErr.message;
    }

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

    const filePath = path.join(SITE_DIR, file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier non trouve' });
    }

    // Mettre a jour le JSON
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    data.onlineName = onlineName.trim();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // Git add, commit, push
    let gitResult = '';
    try {
      execSync(`git add "site/${file}"`, { cwd: REPO_DIR, stdio: 'pipe' });
      const status = execSync(`git status --porcelain "site/${file}"`, { cwd: REPO_DIR, encoding: 'utf-8' });
      if (status.trim()) {
        const msg = `Renommage online: ${file} -> ${onlineName.trim()}`;
        execSync(`git commit -m "${msg}"`, { cwd: REPO_DIR, stdio: 'pipe' });
        execSync('git push', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 });
        gitResult = 'Changements push sur GitHub';
      } else {
        gitResult = 'Aucun changement';
      }
    } catch (gitErr) {
      gitResult = 'Fichier mis a jour localement, erreur git: ' + gitErr.message;
    }

    res.json({ success: true, onlineName: data.onlineName, message: gitResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
