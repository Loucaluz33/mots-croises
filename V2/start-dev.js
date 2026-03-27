import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const child = spawn('node', ['node_modules/vite/bin/vite.js', '--port', '5173'], {
  cwd: __dirname,
  stdio: 'inherit',
})
child.on('exit', (code) => process.exit(code ?? 0))
