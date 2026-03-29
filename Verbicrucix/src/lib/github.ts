/**
 * Client GitHub API pour gérer le site joueur (GitHub Pages).
 * Permet de lire/écrire des fichiers dans le repo et de commit/push.
 */

// ========== CONFIG ==========

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
}

const STORAGE_KEY = 'verbicrucix_github_config'

export function getGitHubConfig(): GitHubConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const config = JSON.parse(raw) as GitHubConfig
    if (!config.token || !config.owner || !config.repo) return null
    return config
  } catch {
    return null
  }
}

export function saveGitHubConfig(config: GitHubConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearGitHubConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ========== API HELPERS ==========

async function ghFetch(config: GitHubConfig, path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`GitHub API ${res.status}: ${(body as { message?: string }).message || res.statusText}`)
  }
  return res
}

// ========== FILE OPERATIONS ==========

interface GHFileContent {
  name: string
  path: string
  sha: string
  content: string // base64
  encoding: string
}

interface GHDirEntry {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir'
}

/** List files at the root of the repo */
export async function listRepoFiles(config: GitHubConfig): Promise<GHDirEntry[]> {
  const res = await ghFetch(config, '/contents/')
  return res.json()
}

/** Read a file's content (decoded from base64) */
export async function readFile(config: GitHubConfig, filePath: string): Promise<{ content: string; sha: string }> {
  const res = await ghFetch(config, `/contents/${encodeURIComponent(filePath)}`)
  const data = await res.json() as GHFileContent
  const content = atob(data.content.replace(/\n/g, ''))
  return { content, sha: data.sha }
}

/** Create or update a file (auto-commits) */
export async function writeFile(
  config: GitHubConfig,
  filePath: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  }
  if (sha) body.sha = sha
  await ghFetch(config, `/contents/${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

// ========== SITE-SPECIFIC OPERATIONS ==========

export interface SiteGrid {
  file: string
  title: string
  onlineName: string
  author: string
  size: { rows: number; cols: number } | null
}

/** Parse index.html to extract the list of online grid files */
function parseOnlineGrids(html: string): string[] {
  const match = html.match(/const grids = \[([\s\S]*?)\];/)
  if (!match) return []
  const files: string[] = []
  const re = /file:\s*'([^']+)'/g
  let m
  while ((m = re.exec(match[1])) !== null) {
    files.push(m[1])
  }
  return files
}

/** Build the updated index.html content */
function updateIndexHtml(html: string, onlineFiles: string[]): string {
  const entries = onlineFiles.map(f => `  { file: '${f}' }`).join(',\n')
  const newBlock = `const grids = [\n${entries}\n];`
  return html.replace(/const grids = \[[\s\S]*?\];/, newBlock)
}

/** Read grid metadata from a JSON file on GitHub */
async function readGridMeta(config: GitHubConfig, fileName: string): Promise<SiteGrid> {
  try {
    const { content } = await readFile(config, fileName)
    const data = JSON.parse(content)
    return {
      file: fileName,
      title: (data.title && data.title !== 'Sans titre') ? data.title : fileName.replace('.json', ''),
      onlineName: data.onlineName || data.title || fileName.replace('.json', ''),
      author: data.author || '',
      size: data.size || null,
    }
  } catch {
    return {
      file: fileName,
      title: fileName.replace('.json', ''),
      onlineName: fileName.replace('.json', ''),
      author: '',
      size: null,
    }
  }
}

/** Get all site grids (online + offline on GitHub) */
export async function getSiteGrids(config: GitHubConfig): Promise<{ online: SiteGrid[]; offline: SiteGrid[]; indexSha: string }> {
  // List all JSON files at repo root
  const files = await listRepoFiles(config)
  const jsonFiles = files
    .filter(f => f.type === 'file' && f.name.endsWith('.json') && f.name !== 'package.json' && f.name !== 'package-lock.json')
    .map(f => f.name)

  // Read index.html to get online list
  const { content: indexHtml, sha: indexSha } = await readFile(config, 'index.html')
  const onlineFiles = parseOnlineGrids(indexHtml)

  // Read metadata for all grids
  const allGrids = await Promise.all(jsonFiles.map(f => readGridMeta(config, f)))

  const online = onlineFiles
    .map(f => allGrids.find(g => g.file === f))
    .filter((g): g is SiteGrid => g !== undefined)

  const offline = allGrids.filter(g => !onlineFiles.includes(g.file))

  return { online, offline, indexSha }
}

/** Apply changes: update index.html with new online grid list */
export async function applySiteChanges(
  config: GitHubConfig,
  onlineFiles: string[],
): Promise<void> {
  const { content: indexHtml, sha } = await readFile(config, 'index.html')
  const newHtml = updateIndexHtml(indexHtml, onlineFiles)
  await writeFile(config, 'index.html', newHtml, `Mise à jour grilles site: ${onlineFiles.join(', ')}`, sha)
}

/** Update the onlineName of a grid JSON file on GitHub */
export async function updateOnlineName(
  config: GitHubConfig,
  fileName: string,
  onlineName: string,
): Promise<void> {
  const { content, sha } = await readFile(config, fileName)
  const data = JSON.parse(content)
  data.onlineName = onlineName.trim()
  await writeFile(config, fileName, JSON.stringify(data, null, 2), `Renommage online: ${fileName} → ${onlineName.trim()}`, sha)
}

/** Upload a grid JSON to the repo */
export async function uploadGrid(
  config: GitHubConfig,
  fileName: string,
  gridJson: string,
): Promise<void> {
  // Check if file already exists
  let sha: string | undefined
  try {
    const existing = await readFile(config, fileName)
    sha = existing.sha
  } catch {
    // File doesn't exist yet
  }
  await writeFile(config, fileName, gridJson, `Ajout grille: ${fileName}`, sha)
}
