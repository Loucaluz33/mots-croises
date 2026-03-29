import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { dictDownloadPlugin } from './vite-plugins/dict-downloader'

/** Path to the SQLite database file (same parent directory) */
const DB_PATH = path.resolve(__dirname, 'verbicrucix.db')

function sqliteDevServer(): Plugin {
  return {
    name: 'sqlite-dev-server',
    configureServer(server) {
      server.middlewares.use('/api/db', (req, res) => {
        handleDbRequest(req, res)
      })
    },
    // Also serve DB in preview mode (production build)
    configurePreviewServer(server) {
      server.middlewares.use('/api/db', (req, res) => {
        handleDbRequest(req, res)
      })
    },
  }
}

function handleDbRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  if (req.method === 'GET') {
    if (!fs.existsSync(DB_PATH)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Base de données introuvable', path: DB_PATH }))
      return
    }
    const stat = fs.statSync(DB_PATH)
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
    })
    fs.createReadStream(DB_PATH).pipe(res)
    return
  }

  if (req.method === 'POST') {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const data = Buffer.concat(chunks)
      fs.writeFileSync(DB_PATH, data)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, size: data.length }))
    })
    return
  }

  res.writeHead(405).end()
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), sqliteDevServer(), dictDownloadPlugin(DB_PATH)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
