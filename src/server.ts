import express from 'express'
import { workspaceApi } from './workspace-api.js'
import { type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, mkdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createAccounts, AccountError } from './accounts.js'
import { dimensions, type Mode, type Report, type Session } from './shared.js'

const directory = process.env.DATA_DIR || 'data'
const audioDirectory = join(directory, 'audio')
mkdirSync(audioDirectory, { recursive: true })
const db = new DatabaseSync(join(directory, 'practice.sqlite'))
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, finished INTEGER NOT NULL DEFAULT 0, report TEXT
  );
  CREATE TABLE IF NOT EXISTS answers (
    session_id TEXT NOT NULL REFERENCES sessions(id), position INTEGER NOT NULL,
    question TEXT NOT NULL, file TEXT, mime TEXT, mode TEXT, ready_at INTEGER,
    manual TEXT, PRIMARY KEY (session_id, position)
  );
`)
const accounts = createAccounts(db)
const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all()
if (!sessionColumns.some(column => column.name === 'owner_id')) {
  db.exec('ALTER TABLE sessions ADD COLUMN owner_id INTEGER REFERENCES accounts(id)')
}
if (!sessionColumns.some(column => column.name === 'report_stale')) {
  db.exec('ALTER TABLE sessions ADD COLUMN report_stale INTEGER NOT NULL DEFAULT 0')
}
db.exec('CREATE INDEX IF NOT EXISTS session_owner ON sessions(owner_id)')

type StoredAnswer = {
  question: string; file: string | null; mime: string | null
  mode: Mode | null; ready_at: number | null; manual: string | null
}
const getAnswers = db.prepare('SELECT * FROM answers WHERE session_id = ? ORDER BY position')
const fixedTranscripts = [
  '我先明确项目目标，再把问题拆成几个可以验证的假设，逐项检查结果。',
  '我和团队对齐了分工，记录了分歧和取舍，并在复盘时总结了改进点。',
]
function session(id: string): Session {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  if (!row) throw new HttpError(404, '找不到这场练习。')
  return {
    id,
    finished: Boolean(row.finished),
    report: row.report ? JSON.parse(String(row.report)) : null,
    reportStale: Boolean(row.report_stale),
    answers: (getAnswers.all(id) as StoredAnswer[]).map((answer, index) => {
      const status = answer.manual ? 'ready'
        : !answer.file ? 'empty'
        : Date.now() < Number(answer.ready_at) ? 'pending'
        : answer.mode === 'fail' ? 'failed' : 'ready'
      return {
        question: answer.question,
        audio: Boolean(answer.file),
        status,
        transcript: status === 'ready' ? answer.manual ?? fixedTranscripts[index % fixedTranscripts.length] : '',
      }
    }),
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
async function body(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) {
      req.resume()
      throw new HttpError(413, '文件超过上传上限。')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
async function json(req: IncomingMessage, limit = 16_384) {
  const raw = await body(req, limit)
  try {
    const value = JSON.parse(raw.toString())
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new HttpError(400, '请求格式无效。')
  }
}
function send(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
function audioResponse(req: IncomingMessage, res: ServerResponse, answer: StoredAnswer) {
  if (!answer.file) throw new HttpError(404, '这道题还没有录音。')
  const file = join(audioDirectory, answer.file)
  const { size } = statSync(file)
  const headers = { 'Content-Type': answer.mime!, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  const range = req.headers.range
  if (!range) {
    res.writeHead(200, { ...headers, 'Content-Length': size })
    createReadStream(file).pipe(res)
    return
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]))
  const end = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!match || start >= size || end < start) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
    return
  }
  res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` })
  createReadStream(file, { start, end }).pipe(res)
}

const assets = new Map([
  ['/brand/haohaomian.png', ['public/brand/haohaomian.png', 'image/png']],
  ['/workspace-prototype', ['dist/workspace/workspace.html', 'text/html; charset=utf-8']],
  ['/workspace', ['dist/workspace/workspace.html', 'text/html; charset=utf-8']],
  ['/workspace-prototype.js', ['dist/workspace-prototype.js', 'text/javascript']],
  ['/workspace-prototype.css', ['public/workspace-prototype.css', 'text/css']],

  ['/account', ['public/account.html', 'text/html; charset=utf-8']],
  ['/account.js', ['dist/account.js', 'text/javascript']],
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css']],
  ['/app.js', ['dist/app.js', 'text/javascript']],
  ['/shared.js', ['dist/shared.js', 'text/javascript']],
  ...(process.env.NODE_ENV === 'production' ? [] : [
    ['/report-prototype.js', ['dist/report-prototype.js', 'text/javascript']],
    ['/report-prototype.css', ['public/report-prototype.css', 'text/css']],
  ] as [string, string[]][]),
])

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = req.method
  const account = accounts.current(req)
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(method ?? '')) {
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      throw new HttpError(403, '请求来源不匹配。')
    }
  }
  if (path === '/api/account' && method === 'GET') return send(res, { enabled: accounts.enabled, account: account ?? null })
  if (path.startsWith('/api/account/')) {
    if (!accounts.enabled) throw new HttpError(404, '当前为本机练习模式。')
    if (path === '/api/account/login' && method === 'POST') {
      const { email, password } = await json(req)
      await accounts.login(res, email, password)
      return send(res, { ok: true })
    }
    if (path === '/api/account/logout' && method === 'POST') {
      accounts.logout(req, res)
      return send(res, { ok: true })
    }
    if (path === '/api/account/redeem' && method === 'POST') {
      const { invite, password, email } = await json(req)
      return send(res, await accounts.redeem(invite, password, email), 201)
    }
    if (path === '/api/account/manage' && method === 'GET') return send(res, accounts.manage(account))
    if (path === '/api/account/invite' && method === 'POST') {
      const { email } = await json(req)
      return send(res, accounts.invite(account, email), 201)
    }
    if (path === '/api/account/invites' && method === 'POST') {
      const { count=10 }=await json(req)
      if(count!==10)throw new HttpError(400,'每批生成10个邀请码。')
      return send(res,{invites:Array.from({length:10},()=>accounts.invite(account,undefined))},201)
    }
    const target = /^\/api\/account\/manage\/(\d+)$/.exec(path)
    if (target && method === 'PUT') {
      const { active } = await json(req)
      accounts.setActive(account, Number(target[1]), active)
      return send(res, { ok: true })
    }
    throw new HttpError(404, '找不到此操作。')
  }
  if (accounts.enabled && !account && path.startsWith('/api/sessions')) throw new HttpError(401, '请先登录。')
  if (accounts.enabled && !account && method === 'GET' && ['/', '/workspace', '/workspace-prototype'].includes(path)) {
    res.writeHead(302, { Location: path.startsWith('/workspace') ? '/account?next=/workspace' : '/account' }).end()
    return
  }
  const asset = assets.get(path)
  if (method === 'GET' && asset) {
    res.writeHead(200, { 'Content-Type': asset[1] })
    createReadStream(asset[0]).pipe(res)
    return
  }
  if (method === 'POST' && path === '/api/sessions') {
    const { questions } = await json(req, 96 * 1024)
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 30 ||
      questions.some(q => typeof q !== 'string' || !q.trim() || q.trim().length > 500)) {
      throw new HttpError(400, '请填写 1 至 30 道题，每题最多 500 字。')
    }
    const id = randomUUID()
    db.exec('BEGIN')
    try {
      db.prepare('INSERT INTO sessions (id, owner_id) VALUES (?, ?)').run(id, account?.id ?? null)
      const insert = db.prepare('INSERT INTO answers (session_id, position, question) VALUES (?, ?, ?)')
      questions.forEach((question: string, position: number) => insert.run(id, position, question.trim()))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return send(res, session(id), 201)
  }
  if (method === 'GET' && path === '/api/sessions') {
    const records = db.prepare(`
      SELECT sessions.id, finished, answers.question FROM sessions
      JOIN answers ON answers.session_id = sessions.id AND answers.position = 0
      WHERE owner_id IS ? ORDER BY sessions.rowid DESC LIMIT 100
    `).all(account?.id ?? null)
    return send(res, records)
  }
  const match = /^\/api\/sessions\/([a-f0-9-]{36})(?:\/(finish|report|answers\/\d+\/(?:audio|retry|transcript)))?$/.exec(path)
  if (!match) throw new HttpError(404, '找不到此页面。')
  const [, id, action] = match
  const owned = db.prepare('SELECT 1 FROM sessions WHERE id = ? AND owner_id IS ?').get(id, account?.id ?? null)
  if (!owned) throw new HttpError(404, '找不到这场练习。')
  const current = session(id)
  if (method === 'GET' && !action) return send(res, current)
  if (method === 'POST' && action === 'finish') {
    db.prepare('UPDATE sessions SET finished = 1 WHERE id = ?').run(id)
    return send(res, session(id))
  }
  if (method === 'POST' && action === 'report') {
    if (!current.finished) throw new HttpError(409, '请先结束练习。')
    if (current.answers.some(answer => answer.status === 'pending')) {
      throw new HttpError(409, '转写进行中，请稍后生成报告。')
    }
    const exampleScores = [76, 74, 82, 78, 72, 75]
    const tips = ['说清经历与岗位要求的对应关系。', '补充关键技术取舍和验证方法。', '交代拆解依据和验证结果。', '说清自己如何处理分歧和推动进展。', '补充复盘后具体改变的做法。', '用实际决策说明你如何处理压力。']
    const midpoint = Math.ceil(current.answers.length / 2)
    const rows = dimensions.map((_, index) => {
      const start = index < 3 ? 0 : current.answers.length === 1 ? 0 : midpoint
      const end = index < 3 ? midpoint : current.answers.length
      const candidates = current.answers.slice(start, end)
      const offset = candidates.findIndex(answer => answer.transcript.trim())
      const answerIndex = offset === -1 ? null : start + offset
      const quote = answerIndex === null ? '' : current.answers[answerIndex].transcript
      return {
        score: quote ? exampleScores[index] : 60,
        answerIndex: quote ? answerIndex : null,
        quote: quote.slice(0, 180),
        tip: quote ? tips[index] : '对应作答缺少可用转写，使用默认分。',
      }
    })
    const report: Report = {
      total: rows.reduce((sum, row, index) => sum + row.score * dimensions[index][1], 0) / 100,
      rows,
    }
    db.prepare('UPDATE sessions SET report = ?, report_stale = 0 WHERE id = ?').run(JSON.stringify(report), id)
    return send(res, session(id))
  }
  if (action?.startsWith('answers/')) {
    const [, positionText, operation] = action.split('/')
    const position = Number(positionText)
    const stored = (getAnswers.all(id) as StoredAnswer[])[position]
    if (!stored) throw new HttpError(404, '找不到这道题。')
    if (method === 'GET' && operation === 'audio') return audioResponse(req, res, stored)
    if (method === 'PUT' && operation === 'audio') {
      if (current.finished) throw new HttpError(409, '练习已结束。')
      const mode = url.searchParams.get('mode')
      if (mode !== 'success' && mode !== 'slow' && mode !== 'fail') throw new HttpError(400, '请选择转写模式。')
      const mime = req.headers['content-type']?.split(';')[0]
      if (!mime || !['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'].includes(mime)) {
        throw new HttpError(415, '浏览器生成的音频格式不受支持。')
      }
      const bytes = await body(req, 25 * 1024 * 1024)
      if (!bytes.length) throw new HttpError(400, '录音为空，请重新录制。')
      const latest = session(id)
      if (latest.finished || latest.answers[position].audio) throw new HttpError(409, '这道题已保存录音。')
      const file = randomUUID()
      writeFileSync(join(audioDirectory, file), bytes)
      try {
        db.prepare('UPDATE answers SET file = ?, mime = ?, mode = ?, ready_at = ? WHERE session_id = ? AND position = ?')
          .run(file, mime, mode, Date.now() + (mode === 'slow' ? 8000 : 1000), id, position)
      } catch (error) {
        unlinkSync(join(audioDirectory, file))
        throw error
      }
      return send(res, session(id))
    }
    if (method === 'POST' && operation === 'retry' && current.answers[position].status === 'failed') {
      db.prepare("UPDATE answers SET mode = 'success', ready_at = ? WHERE session_id = ? AND position = ?")
        .run(Date.now() + 1000, id, position)
      return send(res, session(id))
    }
    if (method === 'PUT' && operation === 'transcript') {
      const { transcript } = await json(req)
      if (typeof transcript !== 'string' || !transcript.trim() || transcript.trim().length > 3000) {
        throw new HttpError(400, '请输入 1 至 3000 字的作答文字。')
      }
      db.exec('BEGIN')
      try {
        db.prepare('UPDATE answers SET manual = ? WHERE session_id = ? AND position = ?').run(transcript.trim(), id, position)
        db.prepare('UPDATE sessions SET report_stale = 1 WHERE id = ? AND report IS NOT NULL').run(id)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return send(res, session(id))
    }
  }
  throw new HttpError(404, '找不到此操作。')
}

const port = Number(process.env.PORT || 3000)
const app = express()
app.disable('x-powered-by')
app.use('/assets', express.static('dist/workspace/assets', { index: false, immutable: true, maxAge: '1y' }))
app.use('/api/workspace', workspaceApi(resolve(directory), req => {
  const account = accounts.current(req)
  return account ? 'user-' + account.id : accounts.enabled ? undefined : 'local'
}))
app.use((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  handle(req, res).catch(error => {
    if (error instanceof HttpError || error instanceof AccountError) return send(res, { error: error.message }, error.status)
    console.error(error)
    send(res, { error: '保存或读取失败，请重试。' }, 500)
  })
}).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`好好面 http://localhost:${port}`))
