import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'

type Account = { id: number; email: string; role: 'admin' | 'user'; active: number }
type Credential = Account & { password: string }
const day = 86_400_000
const cookieName = 'haohaozhao_session'
const token = () => randomBytes(32).toString('base64url')
const inviteCode = () => {const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(randomBytes(16),byte=>alphabet[byte&31]).join('').match(/.{4}/g)!.join('-')}
const validInvite = (raw:unknown):raw is string => typeof raw==='string' && (/^[\w-]{43}$/.test(raw)||/^(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/.test(raw))
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

export class AccountError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function emailAddress(value: unknown) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new AccountError(400, '请输入有效的邮箱地址。')
  }
  return value.trim().toLowerCase()
}

function passwordInput(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new AccountError(400, '密码需要 12 至 128 个字符。')
  }
  return value
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key))
  })
}

export function createAccounts(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')), active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS account_invites (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL, digest TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL, consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS account_logins (
      digest TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_login_owner ON account_logins(account_id);
  `)
  const insert = db.prepare('INSERT INTO accounts (email, password, role) VALUES (?, ?, ?)')
  let enabled = Boolean(db.prepare('SELECT 1 FROM accounts LIMIT 1').get())
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
  if (!enabled && (ADMIN_EMAIL || ADMIN_PASSWORD)) {
    const email = emailAddress(ADMIN_EMAIL)
    const password = passwordInput(ADMIN_PASSWORD)
    const salt = token()
    insert.run(email, salt + ':' + scryptSync(password, salt, 64).toString('hex'), 'admin')
    enabled = true
  }
  const secure = process.env.SECURE_COOKIES === '1' ? '; Secure' : ''
  function cookie(res: ServerResponse, value: string, maxAge: number) {
    res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`)
  }
  function readToken(req: IncomingMessage) {
    const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
    return value && /^[\w-]{43}$/.test(value) ? digest(value) : undefined
  }
  function current(req: IncomingMessage): Account | undefined {
    const key = readToken(req)
    if (!key) return
    return db.prepare(`
      SELECT accounts.id, email, role, active FROM account_logins JOIN accounts ON accounts.id = account_id
      WHERE digest = ? AND expires_at > ? AND active = 1
    `).get(key, Date.now()) as Account | undefined
  }
  function requireAdmin(account: Account | undefined) {
    if (account?.role !== 'admin') throw new AccountError(account ? 403 : 401, '需要管理员登录。')
  }
  const users = db.prepare('SELECT id, email, role, active FROM accounts ORDER BY id')
  const invites = db.prepare('SELECT id, email, expires_at AS expiresAt, consumed_at AS consumedAt FROM account_invites ORDER BY id DESC')
  const dummySalt = token()
  let authenticationRequests = 0
  return {
    enabled,
    current,
    async login(res: ServerResponse, emailValue: unknown, passwordValue: unknown) {
      const email = emailAddress(emailValue)
      const password = passwordInput(passwordValue)
      if (authenticationRequests >= 4) throw new AccountError(429, '登录请求较多，请稍后重试。')
      authenticationRequests++
      const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email) as Credential | undefined
      try {
        const [salt, hash] = account?.password.split(':') ?? [dummySalt, '0'.repeat(128)]
        const valid = timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'))
        if (!valid || !account || !db.prepare('SELECT 1 FROM accounts WHERE id = ? AND active = 1').get(account.id)) {
          throw new AccountError(401, '邮箱或密码无效。')
        }
        const value = token()
        db.prepare('DELETE FROM account_logins WHERE expires_at <= ?').run(Date.now())
        db.prepare('INSERT INTO account_logins VALUES (?, ?, ?)').run(digest(value), account.id, Date.now() + 7 * day)
        cookie(res, value, 7 * day / 1000)
      } finally { authenticationRequests-- }
    },
    logout(req: IncomingMessage, res: ServerResponse) {
      const key = readToken(req)
      if (key) db.prepare('DELETE FROM account_logins WHERE digest = ?').run(key)
      cookie(res, '', 0)
    },
    manage(account: Account | undefined) {
      requireAdmin(account)
      return { accounts: users.all(), invites: invites.all() }
    },
    invite(account: Account | undefined, value: unknown) {
      requireAdmin(account)
      const email = value===undefined || value==='' ? '' : emailAddress(value)
      if (email && db.prepare('SELECT 1 FROM accounts WHERE email = ?').get(email)) throw new AccountError(409, '此邮箱已有账户。')
      const raw = email?token():inviteCode()
      db.prepare('INSERT INTO account_invites (email, digest, expires_at) VALUES (?, ?, ?)').run(email, digest(raw), Date.now() + (email?day:7*day))
      return { path: '/account?invite=' + raw, ...(email?{}:{code:raw}), expiresAt:Date.now()+(email?day:7*day) }
    },
    async redeem(raw: unknown, value: unknown, emailValue?:unknown) {
      if(typeof raw==='string'&&raw.length!==43)raw=raw.trim().toUpperCase()
      if (!validInvite(raw)) throw new AccountError(400, '邀请链接无效。')
      const password = passwordInput(value)
      const key = digest(raw)
      const available = db.prepare('SELECT email FROM account_invites WHERE digest = ? AND consumed_at IS NULL AND expires_at > ?')
      const initial=available.get(key, Date.now()) as {email:string}|undefined
      if (!initial) throw new AccountError(410, '邀请已使用或过期。')
      const email=initial.email || emailAddress(emailValue)
      if (authenticationRequests >= 4) throw new AccountError(429, '注册请求较多，请稍后重试。')
      authenticationRequests++
      const salt = token()
      let hash: Buffer
      try { hash = await derive(password, salt) } finally { authenticationRequests-- }
      db.exec('BEGIN')
      try {
        const now = Date.now()
        const invitation = available.get(key, now) as { email: string } | undefined
        if (!invitation) throw new AccountError(410, '邀请已使用或过期。')
        if (db.prepare('SELECT 1 FROM accounts WHERE email = ?').get(email)) {
          throw new AccountError(409, '此邮箱已有账户。')
        }
        insert.run(email, salt + ':' + hash.toString('hex'), 'user')
        db.prepare('UPDATE account_invites SET consumed_at = ? WHERE digest = ?').run(now, key)
        db.exec('COMMIT')
        return { email }
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    setActive(account: Account | undefined, id: number, active: unknown) {
      requireAdmin(account)
      if (typeof active !== 'boolean') throw new AccountError(400, '账户状态无效。')
      const result = db.prepare("UPDATE accounts SET active = ? WHERE id = ? AND role = 'user'").run(Number(active), id)
      if (!result.changes) throw new AccountError(404, '找不到可管理的用户。')
      if (!active) db.prepare('DELETE FROM account_logins WHERE account_id = ?').run(id)
    },
  }
}
