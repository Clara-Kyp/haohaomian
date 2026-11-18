// Isolated throwaway preview: mock report data only, no application routes or APIs.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
const root = new URL('../docs/prototypes/report-review/', import.meta.url)
const port = Number(process.env.REPORT_PREVIEW_PORT || 3002)
createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname
  const file = path === '/' || path === '/index.html' ? 'index.html' : path === '/prompt.md' ? 'prompt.md' : path === '/logo.png'?'logo.png':''
  if (!file || req.method !== 'GET') { res.writeHead(404).end('Not found'); return }
  try {
    const body = await readFile(new URL(file, root))
    res.writeHead(200, { 'content-type': file.endsWith('.png')?'image/png':file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  } catch { res.writeHead(404).end('Not found') }
}).listen(port, '127.0.0.1', () => console.log(`Report review prototype: http://localhost:${port}/`))
