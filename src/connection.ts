/**
 * Page-managed PostgreSQL connection.
 *
 * The connection string cannot live in the database itself, so the
 * configuration saved from the web UI is persisted to a per-user JSON file.
 * Resolution priority:
 *
 *   page-saved file  >  cordis.patch.yml `databaseUrl`  >  schema default
 *
 * The manager never throws at plugin load: when the target is unreachable the
 * plugin still boots (the sidebar panel renders), management routes answer
 * 503, and /health + /connection* stay available so the UI can fix and
 * hot-swap the connection without a restart.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import pg, { type Pool as PgPool } from 'pg'
import type { IntentDb } from './db.ts'
import { HttpError } from './http.ts'

const { Pool } = pg

export interface ConnectionFields {
  host: string
  port: number
  database: string
  user: string
  /** Masked ('***') in GET responses; '***' in PUT means "keep current". */
  password: string
  ssl: boolean
}

export interface ConnectionState {
  /** A connection target exists. */
  configured: boolean
  /** Last probe succeeded. */
  connected: boolean
  /** Where the active target came from: page-saved file or bundle patch. */
  source: 'page' | 'bundle'
  /** Masked postgres:// URL (password replaced by ***). */
  databaseUrl: string
  /** Parsed fields for pre-filling the form (password masked). */
  fields: ConnectionFields
  /** Last connection / migration problem, if any. */
  error?: string
  /** Absolute path of the page-saved config file. */
  filePath: string
}

export interface ConnectionManager {
  /** Resolve the initial target (saved file or bundle fallback) and probe it. Never throws. */
  init(): Promise<void>
  state(): ConnectionState
  /** Probe a candidate target without saving (for the "测试连接" button). */
  test(body: unknown): Promise<{ ok: true; latency_ms: number; pgvector: boolean }>
  /** Probe, persist and hot-swap the pool. Throws HttpError on failure; the old pool is kept. */
  update(body: unknown): Promise<ConnectionState>
  /** Remove the page-saved file and fall back to the bundle-patch URL. */
  reset(): Promise<ConnectionState>
  /** Check whether the database named by the candidate target exists on that server. */
  databaseInfo(body: unknown): Promise<{ database: string; exists: boolean }>
  /** Create the database on the target server, install pgvector and initialize all tables. */
  databaseCreate(body: unknown): Promise<{ database: string; created: boolean; vector: boolean; tables: boolean }>
  /** Drop the database (requires body.confirm === database name). */
  databaseDrop(body: unknown): Promise<{ database: string; dropped: boolean }>
}

export interface ConnectionManagerDeps {
  bundleUrl: string
  db: IntentDb
  autoMigrate: boolean
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
  /** Build a throwaway migrator bound to another database URL (used after CREATE DATABASE). */
  makeMigrator: (url: string) => { migrate(): Promise<void>; close(): Promise<void> }
}

/** Absolute path of the page-saved connection file (per-OS config dir). */
export function configFilePath(): string {
  const fromEnv = process.env.DSH_INTENT_RECOGNITION_CONFIG
  if (fromEnv && fromEnv.trim() !== '') return fromEnv
  const home = homedir()
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? join(home, 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  return join(base, 'dsh-intent-recognition', 'connection.json')
}

function readSaved(filePath: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as { databaseUrl?: unknown }
    return typeof raw.databaseUrl === 'string' && raw.databaseUrl.trim() !== '' ? raw.databaseUrl.trim() : null
  } catch {
    return null
  }
}

function writeSaved(filePath: string, databaseUrl: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify({ databaseUrl }, null, 2) + '\n', { mode: 0o600 })
}

function clearSaved(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    /* best effort */
  }
}

function passwordOf(url: string): string {
  try {
    return new URL(url).password
  } catch {
    return ''
  }
}

/** Replace an asterisk-masked password in a user-supplied URL with the current one. */
function inheritPassword(url: string, currentUrl: string): string {
  try {
    const u = new URL(url)
    if (u.password.includes('***')) u.password = passwordOf(currentUrl)
    return u.toString()
  } catch {
    throw new HttpError(400, '连接串格式不正确，应为 postgres://user:password@host:port/database')
  }
}

function buildUrl(f: ConnectionFields): string {
  const user = encodeURIComponent(f.user)
  const auth = f.password !== '' ? `${user}:${encodeURIComponent(f.password)}@` : `${user}@`
  const query = f.ssl ? '?sslmode=require' : ''
  return `postgres://${auth}${f.host}:${f.port}/${encodeURIComponent(f.database)}${query}`
}

function fieldsFromUrl(url: string): ConnectionFields {
  const fallback: ConnectionFields = { host: '127.0.0.1', port: 5432, database: 'dsh_intent', user: 'postgres', password: '', ssl: false }
  try {
    const u = new URL(url)
    return {
      host: u.hostname || fallback.host,
      port: Number(u.port) || 5432,
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || fallback.database,
      user: decodeURIComponent(u.username) || fallback.user,
      password: u.password !== '' ? '***' : '',
      ssl: ['require', 'verify-ca', 'verify-full'].includes(u.searchParams.get('sslmode') ?? ''),
    }
  } catch {
    return fallback
  }
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password !== '') u.password = '***'
    return u.toString()
  } catch {
    return url.replace(/(postgres(?:ql)?:\/\/[^:/?#]*:)[^@]*@/i, '$1***@')
  }
}

function friendlyPgError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('ECONNREFUSED')) return `无法连接 PostgreSQL（连接被拒绝）——请确认服务已启动且地址端口正确：${msg}`
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) return `连接 PostgreSQL 超时：${msg}`
  if (msg.includes('password authentication failed')) return `PostgreSQL 账号或密码错误：${msg}`
  if (msg.includes('does not exist')) return `数据库不存在（可先用 createdb 创建）：${msg}`
  return msg
}

/** Probe a candidate URL: connectivity + pgvector availability. Throws HttpError(400) on failure. */
async function probeUrl(url: string): Promise<{ ok: true; latency_ms: number; pgvector: boolean }> {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000 })
  const t0 = Date.now()
  try {
    await pool.query('SELECT 1')
    const r = await pool.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'vector'`)
    return { ok: true, latency_ms: Date.now() - t0, pgvector: (r.rowCount ?? 0) > 0 }
  } catch (err) {
    throw new HttpError(400, friendlyPgError(err))
  } finally {
    await pool.end().catch(() => {})
  }
}

/** Normalize the PUT/test body (structured fields or a raw URL) into a connection string. */
function urlFromBody(body: unknown, currentUrl: string): string {
  const src = (body ?? {}) as Record<string, unknown>
  if (typeof src.databaseUrl === 'string' && src.databaseUrl.trim() !== '') {
    const url = src.databaseUrl.trim()
    if (!/^postgres(ql)?:\/\//i.test(url)) throw new HttpError(400, '连接串须以 postgres:// 开头')
    return inheritPassword(url, currentUrl)
  }
  const host = typeof src.host === 'string' ? src.host.trim() : ''
  if (host === '') throw new HttpError(400, '缺少主机地址 host（或直接提供 databaseUrl）')
  const portRaw = Number(src.port)
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const safeDecode = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
  let password = str(src.password)
  if (password === '***') password = safeDecode(passwordOf(currentUrl))
  return buildUrl({
    host,
    port: Number.isFinite(portRaw) && portRaw > 0 ? Math.floor(portRaw) : 5432,
    database: str(src.database) || 'dsh_intent',
    user: str(src.user) || 'postgres',
    password,
    ssl: src.ssl === true,
  })
}

/** System databases that must never be created/dropped from the page. */
const FORBIDDEN_DATABASES = new Set(['postgres', 'template0', 'template1'])

/** Database name (last URL path segment, decoded). */
function databaseNameOf(url: string): string {
  const u = new URL(url)
  const name = safeDecodeName(u.pathname.replace(/^\//, ''))
  if (name === '') throw new HttpError(400, '连接串中缺少数据库名')
  return name
}

function safeDecodeName(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/** Same server/credentials, but pointed at the `postgres` maintenance database. */
function maintenanceUrl(url: string): string {
  const u = new URL(url)
  u.pathname = '/postgres'
  return u.toString()
}

/** Double-quote a SQL identifier (database names are not parameterizable in DDL). */
function quoteIdent(name: string): string {
  if (name.length === 0 || name.length > 63) throw new HttpError(400, '数据库名长度须为 1~63 字符')
  return `"${name.replace(/"/g, '""')}"`
}

/** Run a function against a scratch pool on the given URL. */
async function withPool<T>(url: string, fn: (pool: PgPool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000 })
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => {})
  }
}

export function createConnectionManager(deps: ConnectionManagerDeps): ConnectionManager {
  const { bundleUrl, db, autoMigrate, logger } = deps
  const filePath = configFilePath()
  let currentUrl = bundleUrl
  let source: 'page' | 'bundle' = 'bundle'
  let lastError: string | undefined

  const maybeMigrate = async (): Promise<void> => {
    if (!autoMigrate) return
    try {
      await db.migrate()
    } catch (err) {
      lastError = `数据库已连接，但自动建表/迁移失败：${friendlyPgError(err)}`
      logger.warn('dsh-intent-recognition: migrate failed: %s', lastError)
    }
  }

  const probe = async (): Promise<void> => {
    try {
      await db.pool.query('SELECT 1')
      db.connected = true
      lastError = undefined
      await maybeMigrate()
    } catch (err) {
      db.connected = false
      lastError = friendlyPgError(err)
      logger.warn('dsh-intent-recognition: database unreachable (%s); waiting for page configuration at %s', lastError, filePath)
    }
  }

  return {
    async init() {
      const saved = readSaved(filePath)
      if (saved !== null && saved !== bundleUrl) {
        source = 'page'
        currentUrl = saved
        try {
          await db.reconnect(saved)
          lastError = undefined
          await maybeMigrate()
          return
        } catch (err) {
          db.connected = false
          lastError = friendlyPgError(err)
          logger.warn('dsh-intent-recognition: saved connection failed (%s)', lastError)
          return
        }
      }
      source = saved !== null ? 'page' : 'bundle'
      currentUrl = saved ?? bundleUrl
      await probe()
    },

    state(): ConnectionState {
      return {
        configured: currentUrl.trim() !== '',
        connected: db.connected,
        source,
        databaseUrl: maskUrl(currentUrl),
        fields: fieldsFromUrl(currentUrl),
        ...(lastError !== undefined ? { error: lastError } : {}),
        filePath,
      }
    },

    async test(body) {
      return probeUrl(urlFromBody(body, currentUrl))
    },

    async update(body) {
      const url = urlFromBody(body, currentUrl)
      const probeResult = await probeUrl(url) // throws 400; old pool untouched
      try {
        writeSaved(filePath, url)
      } catch (err) {
        throw new HttpError(500, `连接正常，但配置保存失败（${friendlyPgError(err)}）。可通过环境变量 DSH_INTENT_RECOGNITION_CONFIG 指定可写的配置文件路径`)
      }
      try {
        await db.reconnect(url)
      } catch (err) {
        throw new HttpError(500, `连接测试通过但切换失败：${friendlyPgError(err)}`)
      }
      currentUrl = url
      source = 'page'
      lastError = probeResult.pgvector
        ? undefined
        : '数据库已连接，但未安装 pgvector 扩展（层2 向量检索不可用）'
      // When pgvector is missing, migrate() will surface the precise message.
      await maybeMigrate()
      return this.state()
    },

    async reset() {
      clearSaved(filePath)
      source = 'bundle'
      currentUrl = bundleUrl
      try {
        await db.reconnect(bundleUrl)
        lastError = undefined
        await maybeMigrate()
      } catch (err) {
        db.connected = false
        lastError = friendlyPgError(err)
      }
      return this.state()
    },

    async databaseInfo(body) {
      const url = urlFromBody(body, currentUrl)
      const database = databaseNameOf(url)
      return withPool(maintenanceUrl(url), async pool => {
        const r = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
        return { database, exists: (r.rowCount ?? 0) > 0 }
      }).catch(err => { throw new HttpError(400, friendlyPgError(err)) })
    },

    async databaseCreate(body) {
      const url = urlFromBody(body, currentUrl)
      const database = databaseNameOf(url)
      if (FORBIDDEN_DATABASES.has(database)) throw new HttpError(400, `不允许操作系统库 ${database}`)
      // 1) create the database (idempotent-ish: existing db -> friendly error)
      try {
        await withPool(maintenanceUrl(url), pool => pool.query(`CREATE DATABASE ${quoteIdent(database)}`))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) throw new HttpError(409, `数据库 ${database} 已存在，无需创建`)
        throw new HttpError(400, friendlyPgError(err))
      }
      // 2) pgvector extension inside the new database
      let vector = true
      try {
        await withPool(url, pool => pool.query('CREATE EXTENSION IF NOT EXISTS vector'))
      } catch (err) {
        vector = false
        logger.warn('dsh-intent-recognition: CREATE EXTENSION vector failed on %s: %s', database, friendlyPgError(err))
      }
      // 3) initialize all plugin tables in one go
      let tables = true
      try {
        const migrator = deps.makeMigrator(url)
        try {
          await migrator.migrate()
        } finally {
          await migrator.close()
        }
      } catch (err) {
        tables = false
        lastError = `数据库 ${database} 已创建，但初始化表结构失败：${friendlyPgError(err)}`
        logger.warn('dsh-intent-recognition: init tables failed on %s: %s', database, lastError)
      }
      return { database, created: true, vector, tables }
    },

    async databaseDrop(body) {
      const url = urlFromBody(body, currentUrl)
      const database = databaseNameOf(url)
      if (FORBIDDEN_DATABASES.has(database)) throw new HttpError(400, `不允许操作系统库 ${database}`)
      const confirm = (body as Record<string, unknown> | undefined)?.confirm
      if (confirm !== database) throw new HttpError(400, '请在 confirm 字段中完整填写要删除的数据库名以确认')
      try {
        // FORCE 终止残留连接（PG13+）；数据库不存在则报 404
        await withPool(maintenanceUrl(url), pool => pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)} WITH (FORCE)`))
      } catch (err) {
        throw new HttpError(400, friendlyPgError(err))
      }
      if (database === databaseNameOf(currentUrl)) {
        db.connected = false
        lastError = `当前使用的数据库 ${database} 已被删除，请重新配置连接`
      }
      return { database, dropped: true }
    },
  }
}
