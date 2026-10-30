/**
 * PostgreSQL + pgvector data layer. One pool per plugin instance; schema is
 * created idempotently on load when autoMigrate is on.
 */
import pg from 'pg'
import type { IntentRow, ModelKind, ModelRow, ScenarioRow, ServiceRow } from './types.ts'

const { Pool } = pg
type Pool = InstanceType<typeof Pool>

export interface DbOptions {
  databaseUrl: string
  embeddingDim: number
  autoMigrate: boolean
}

export class IntentDb {
  private _pool: Pool
  readonly dim: number
  /** True after the last successful connectivity probe (SELECT 1 / reconnect). */
  connected = false

  constructor(private readonly options: DbOptions) {
    this._pool = this.makePool(options.databaseUrl)
    this.dim = options.embeddingDim
  }

  /** Live pool handle; may be swapped by reconnect() for page-managed config. */
  get pool(): Pool {
    return this._pool
  }

  private makePool(databaseUrl: string): Pool {
    const pool = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 8000 })
    // Idle-client errors mark the connection as lost so the UI reflects it.
    pool.on('error', () => {
      this.connected = false
    })
    return pool
  }

  /**
   * Hot-swap the pool to a new target (page-managed connection). The new pool
   * is verified first; on failure the old pool stays active and this throws.
   */
  async reconnect(databaseUrl: string): Promise<void> {
    const next = this.makePool(databaseUrl)
    try {
      await next.query('SELECT 1')
    } catch (err) {
      await next.end().catch(() => {})
      throw err
    }
    const prev = this._pool
    this._pool = next
    this.options.databaseUrl = databaseUrl
    this.connected = true
    await prev.end().catch(() => {})
  }

  async close(): Promise<void> {
    await this._pool.end()
  }

  async migrate(): Promise<void> {
    const dim = this.dim
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector')
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ir_scenarios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text NOT NULL DEFAULT '',
        rule_config jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ir_intents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scenario_id uuid NOT NULL REFERENCES ir_scenarios(id) ON DELETE CASCADE,
        name text NOT NULL,
        code text NOT NULL,
        description text NOT NULL DEFAULT '',
        examples text[] NOT NULL DEFAULT '{}',
        keywords text[] NOT NULL DEFAULT '{}',
        blacklist text[] NOT NULL DEFAULT '{}',
        whitelist text[] NOT NULL DEFAULT '{}',
        route jsonb NOT NULL DEFAULT '{"type":"none","target":""}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (scenario_id, code)
      )`)
    // Dimension is baked into the column type; a change requires a rebuild.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ir_intent_embeddings (
        intent_id uuid NOT NULL REFERENCES ir_intents(id) ON DELETE CASCADE,
        example text NOT NULL,
        embedding vector(${dim}) NOT NULL,
        PRIMARY KEY (intent_id, example)
      )`)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ir_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL CHECK (kind IN ('embedding','jev','finetune','llm')),
        name text NOT NULL,
        base_url text NOT NULL,
        api_key text NOT NULL DEFAULT '',
        model text NOT NULL,
        api_style text NOT NULL DEFAULT 'openai' CHECK (api_style IN ('openai','http')),
        extra jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (kind, name)
      )`)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ir_services (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text NOT NULL DEFAULT '',
        scenario_id uuid NOT NULL REFERENCES ir_scenarios(id) ON DELETE CASCADE,
        layers jsonb NOT NULL,
        models jsonb NOT NULL DEFAULT '{}',
        status text NOT NULL DEFAULT 'stopped' CHECK (status IN ('running','stopped')),
        route_mode text NOT NULL DEFAULT 'auto' CHECK (route_mode IN ('auto','suggest')),
        api_key text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`)
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ir_predict_logs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_id uuid NOT NULL REFERENCES ir_services(id) ON DELETE CASCADE,
        query text NOT NULL,
        result jsonb NOT NULL,
        matched_layer text,
        latency_ms integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    // Column-level upgrades for databases initialized by older plugin versions
    // (CREATE TABLE IF NOT EXISTS never alters an existing table). Each ADD
    // COLUMN IF NOT EXISTS is a no-op on fresh installs and backfills the
    // default on old ones.
    await this.pool.query(`ALTER TABLE ir_intents ADD COLUMN IF NOT EXISTS route jsonb NOT NULL DEFAULT '{"type":"none","target":""}'`)
    await this.pool.query(`ALTER TABLE ir_services ADD COLUMN IF NOT EXISTS route_mode text NOT NULL DEFAULT 'auto'`)
    await this.pool.query(`ALTER TABLE ir_services DROP CONSTRAINT IF EXISTS ir_services_route_mode_check`)
    await this.pool.query(`ALTER TABLE ir_services ADD CONSTRAINT ir_services_route_mode_check CHECK (route_mode IN ('auto','suggest'))`)
    await this.pool.query('CREATE INDEX IF NOT EXISTS ir_intents_scenario_idx ON ir_intents (scenario_id)')
    await this.pool.query('ALTER TABLE ir_intent_embeddings ADD COLUMN IF NOT EXISTS model_id uuid')
    await this.pool.query('ALTER TABLE ir_intent_embeddings ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()')
    await this.pool.query('CREATE INDEX IF NOT EXISTS ir_predict_logs_service_idx ON ir_predict_logs (service_id, created_at DESC)')
    // HNSW cosine index (pgvector >= 0.5). Safe to attempt; ignore failure on
    // old pgvector so the plugin still works with sequential scans.
    try {
      await this.pool.query(
        'CREATE INDEX IF NOT EXISTS ir_intent_embeddings_hnsw ON ir_intent_embeddings USING hnsw (embedding vector_cosine_ops)',
      )
    } catch {
      /* pgvector without HNSW: fall back to exact scan */
    }
  }

  // ---- scenarios -------------------------------------------------------
  async listScenarios(): Promise<ScenarioRow[]> {
    const r = await this.pool.query('SELECT * FROM ir_scenarios ORDER BY created_at ASC')
    return r.rows
  }

  async getScenario(id: string): Promise<ScenarioRow | null> {
    const r = await this.pool.query('SELECT * FROM ir_scenarios WHERE id = $1', [id])
    return r.rows[0] ?? null
  }

  async createScenario(input: { name: string; description?: string; rule_config?: ScenarioRow['rule_config'] }): Promise<ScenarioRow> {
    const r = await this.pool.query(
      'INSERT INTO ir_scenarios (name, description, rule_config) VALUES ($1,$2,$3) RETURNING *',
      [input.name, input.description ?? '', JSON.stringify(input.rule_config ?? {})],
    )
    return r.rows[0]
  }

  async updateScenario(id: string, input: Partial<{ name: string; description: string; rule_config: ScenarioRow['rule_config'] }>): Promise<ScenarioRow | null> {
    const r = await this.pool.query(
      `UPDATE ir_scenarios SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         rule_config = COALESCE($4, rule_config),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? null, input.description ?? null, input.rule_config ? JSON.stringify(input.rule_config) : null],
    )
    return r.rows[0] ?? null
  }

  async deleteScenario(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM ir_scenarios WHERE id = $1', [id])
    return (r.rowCount ?? 0) > 0
  }

  // ---- intents ---------------------------------------------------------
  async listIntents(scenarioId: string): Promise<IntentRow[]> {
    const r = await this.pool.query('SELECT * FROM ir_intents WHERE scenario_id = $1 ORDER BY created_at ASC', [scenarioId])
    return r.rows
  }

  async getIntent(id: string): Promise<IntentRow | null> {
    const r = await this.pool.query('SELECT * FROM ir_intents WHERE id = $1', [id])
    return r.rows[0] ?? null
  }

  async createIntent(scenarioId: string, input: Partial<IntentRow>): Promise<IntentRow> {
    const r = await this.pool.query(
      `INSERT INTO ir_intents (scenario_id, name, code, description, examples, keywords, blacklist, whitelist, route)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        scenarioId,
        input.name ?? '',
        input.code ?? '',
        input.description ?? '',
        input.examples ?? [],
        input.keywords ?? [],
        input.blacklist ?? [],
        input.whitelist ?? [],
        JSON.stringify(input.route ?? { type: 'none', target: '' }),
      ],
    )
    return r.rows[0]
  }

  async updateIntent(id: string, input: Partial<IntentRow>): Promise<IntentRow | null> {
    const fields = ['name', 'code', 'description', 'examples', 'keywords', 'blacklist', 'whitelist', 'route'] as const
    const sets: string[] = []
    const values: unknown[] = [id]
    for (const f of fields) {
      if (input[f] !== undefined) {
        values.push(f === 'route' ? JSON.stringify(input[f]) : input[f])
        sets.push(`${f} = $${values.length}`)
      }
    }
    if (sets.length === 0) return this.getIntent(id)
    const r = await this.pool.query(
      `UPDATE ir_intents SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      values,
    )
    return r.rows[0] ?? null
  }

  async deleteIntent(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM ir_intents WHERE id = $1', [id])
    return (r.rowCount ?? 0) > 0
  }

  /** Replace the whole intent list of a scenario (used by Excel import with mode=replace). */
  async replaceIntents(scenarioId: string, intents: Array<Partial<IntentRow>>): Promise<number> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM ir_intents WHERE scenario_id = $1', [scenarioId])
      let n = 0
      for (const it of intents) {
        await client.query(
          `INSERT INTO ir_intents (scenario_id, name, code, description, examples, keywords, blacklist, whitelist, route)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            scenarioId, it.name ?? '', it.code ?? '', it.description ?? '',
            it.examples ?? [], it.keywords ?? [], it.blacklist ?? [], it.whitelist ?? [],
            JSON.stringify(it.route ?? { type: 'none', target: '' }),
          ],
        )
        n++
      }
      await client.query('COMMIT')
      return n
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  /** Upsert intents by (scenario, code) (used by Excel import with mode=merge). */
  async upsertIntents(scenarioId: string, intents: Array<Partial<IntentRow>>): Promise<number> {
    let n = 0
    for (const it of intents) {
      await this.pool.query(
        `INSERT INTO ir_intents (scenario_id, name, code, description, examples, keywords, blacklist, whitelist, route)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (scenario_id, code) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, examples = EXCLUDED.examples,
           keywords = EXCLUDED.keywords, blacklist = EXCLUDED.blacklist, whitelist = EXCLUDED.whitelist,
           route = EXCLUDED.route, updated_at = now()`,
        [
          scenarioId, it.name ?? '', it.code ?? '', it.description ?? '',
          it.examples ?? [], it.keywords ?? [], it.blacklist ?? [], it.whitelist ?? [],
          JSON.stringify(it.route ?? { type: 'none', target: '' }),
        ],
      )
      n++
    }
    return n
  }

  // ---- embeddings ------------------------------------------------------
  /** Rebuild all embeddings of one intent from its examples. */
  async rebuildIntentEmbeddings(intentId: string, examples: string[], embed: (texts: string[]) => Promise<number[][]>, modelId?: string): Promise<number> {
    if (examples.length === 0) {
      await this.pool.query('DELETE FROM ir_intent_embeddings WHERE intent_id = $1', [intentId])
      return 0
    }
    const vectors = await embed(examples)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM ir_intent_embeddings WHERE intent_id = $1', [intentId])
      for (let i = 0; i < examples.length; i++) {
        await client.query(
          'INSERT INTO ir_intent_embeddings (intent_id, example, embedding, model_id) VALUES ($1,$2,$3::vector,$4)',
          [intentId, examples[i], `[${vectors[i].join(',')}]`, modelId ?? null],
        )
      }
      await client.query('COMMIT')
      return examples.length
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  /** Per-scenario vector coverage stats for the vector lab overview. */
  async embeddingOverview(): Promise<Array<{
    scenario_id: string
    scenario_name: string
    intents: number
    examples: number
    chunks: number
    embedded_intents: number
    models: string[]
    last_built_at: string | null
  }>> {
    // intents/examples and chunks are aggregated in separate subqueries to
    // avoid join fan-out double-counting the examples array.
    const r = await this.pool.query(
      `SELECT s.id AS scenario_id, s.name AS scenario_name,
              ii.intents, ii.examples,
              COALESCE(ee.chunks, 0) AS chunks,
              COALESCE(ee.embedded_intents, 0) AS embedded_intents,
              COALESCE(ee.models, '{}') AS models,
              ee.last_built_at
       FROM ir_scenarios s
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS intents,
                COALESCE(SUM(cardinality(i.examples)), 0)::int AS examples
         FROM ir_intents i WHERE i.scenario_id = s.id
       ) ii ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS chunks,
                COUNT(DISTINCT e.intent_id)::int AS embedded_intents,
                ARRAY_AGG(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL) AS models,
                MAX(e.created_at) AS last_built_at
         FROM ir_intent_embeddings e
         JOIN ir_intents i ON i.id = e.intent_id
         LEFT JOIN ir_models m ON m.id = e.model_id
         WHERE i.scenario_id = s.id
       ) ee ON true
       ORDER BY s.created_at ASC`,
    )
    return r.rows
  }

  /** Browse embedding chunks （向量切片） of a scenario, newest first. */
  async listEmbeddingChunks(
    scenarioId: string,
    opts: { intentId?: string; limit: number; offset: number },
  ): Promise<{ total: number; rows: Array<{
    intent_id: string; intent_code: string; intent_name: string
    example: string; dims: number; model_id: string | null; model_name: string | null
    created_at: string
  }> }> {
    const where = opts.intentId ? 'AND i.id = $2' : ''
    const params: unknown[] = opts.intentId ? [scenarioId, opts.intentId] : [scenarioId]
    const total = (await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM ir_intent_embeddings e
       JOIN ir_intents i ON i.id = e.intent_id
       WHERE i.scenario_id = $1 ${where}`, params,
    )).rows[0].n as number
    const r = await this.pool.query(
      `SELECT e.intent_id, i.code AS intent_code, i.name AS intent_name, e.example,
              vector_dims(e.embedding) AS dims, e.model_id, m.name AS model_name, e.created_at
       FROM ir_intent_embeddings e
       JOIN ir_intents i ON i.id = e.intent_id
       LEFT JOIN ir_models m ON m.id = e.model_id
       WHERE i.scenario_id = $1 ${where}
       ORDER BY e.created_at DESC, i.code ASC, e.example ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, opts.limit, opts.offset],
    )
    return { total, rows: r.rows }
  }

  /** Delete one stale chunk (for cleaning bad examples after复盘). */
  async deleteEmbeddingChunk(intentId: string, example: string): Promise<boolean> {
    const r = await this.pool.query(
      'DELETE FROM ir_intent_embeddings WHERE intent_id = $1 AND example = $2', [intentId, example])
    return (r.rowCount ?? 0) > 0
  }

  async embeddingCount(scenarioId: string): Promise<number> {
    const r = await this.pool.query(
      `SELECT count(*)::int AS n FROM ir_intent_embeddings e
       JOIN ir_intents i ON i.id = e.intent_id WHERE i.scenario_id = $1`,
      [scenarioId],
    )
    return r.rows[0]?.n ?? 0
  }

  /** Cosine top-K over the examples of one scenario. score in [-1, 1]. */
  async searchSimilar(scenarioId: string, vector: number[], limit: number): Promise<Array<{ intent_id: string; example: string; score: number }>> {
    const r = await this.pool.query(
      `SELECT e.intent_id, e.example, 1 - (e.embedding <=> $1::vector) AS score
       FROM ir_intent_embeddings e
       JOIN ir_intents i ON i.id = e.intent_id
       WHERE i.scenario_id = $2
       ORDER BY e.embedding <=> $1::vector
       LIMIT $3`,
      [`[${vector.join(',')}]`, scenarioId, limit],
    )
    return r.rows.map((row: { intent_id: string; example: string; score: string | number }) => ({
      intent_id: row.intent_id,
      example: row.example,
      score: Number(row.score),
    }))
  }

  // ---- models ----------------------------------------------------------
  async listModels(kind?: ModelKind): Promise<ModelRow[]> {
    const r = kind
      ? await this.pool.query('SELECT * FROM ir_models WHERE kind = $1 ORDER BY created_at ASC', [kind])
      : await this.pool.query('SELECT * FROM ir_models ORDER BY kind, created_at ASC')
    return r.rows
  }

  async getModel(id: string): Promise<ModelRow | null> {
    const r = await this.pool.query('SELECT * FROM ir_models WHERE id = $1', [id])
    return r.rows[0] ?? null
  }

  async createModel(input: Partial<ModelRow> & { kind: ModelKind }): Promise<ModelRow> {
    const r = await this.pool.query(
      `INSERT INTO ir_models (kind, name, base_url, api_key, model, api_style, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.kind, input.name ?? '', input.base_url ?? '', input.api_key ?? '', input.model ?? '', input.api_style ?? 'openai', JSON.stringify(input.extra ?? {})],
    )
    return r.rows[0]
  }

  async updateModel(id: string, input: Partial<ModelRow>): Promise<ModelRow | null> {
    const fields = ['name', 'base_url', 'api_key', 'model', 'api_style', 'extra'] as const
    const sets: string[] = []
    const values: unknown[] = [id]
    for (const f of fields) {
      if (input[f] !== undefined) {
        values.push(f === 'extra' ? JSON.stringify(input[f]) : input[f])
        sets.push(`${f} = $${values.length}`)
      }
    }
    if (sets.length === 0) return this.getModel(id)
    const r = await this.pool.query(`UPDATE ir_models SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, values)
    return r.rows[0] ?? null
  }

  async deleteModel(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM ir_models WHERE id = $1', [id])
    return (r.rowCount ?? 0) > 0
  }

  // ---- services --------------------------------------------------------
  async listServices(): Promise<ServiceRow[]> {
    const r = await this.pool.query('SELECT * FROM ir_services ORDER BY created_at ASC')
    return r.rows
  }

  async getService(id: string): Promise<ServiceRow | null> {
    const r = await this.pool.query('SELECT * FROM ir_services WHERE id = $1', [id])
    return r.rows[0] ?? null
  }

  async getServiceByKey(apiKey: string): Promise<ServiceRow | null> {
    const r = await this.pool.query('SELECT * FROM ir_services WHERE api_key = $1', [apiKey])
    return r.rows[0] ?? null
  }

  async createService(input: {
    name: string
    description?: string
    scenario_id: string
    layers: ServiceRow['layers']
    models: ServiceRow['models']
    route_mode?: ServiceRow['route_mode']
    api_key: string
  }): Promise<ServiceRow> {
    const r = await this.pool.query(
      `INSERT INTO ir_services (name, description, scenario_id, layers, models, route_mode, api_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.name, input.description ?? '', input.scenario_id, JSON.stringify(input.layers), JSON.stringify(input.models), input.route_mode ?? 'auto', input.api_key],
    )
    return r.rows[0]
  }

  async updateService(id: string, input: Partial<Pick<ServiceRow, 'name' | 'description' | 'scenario_id' | 'layers' | 'models' | 'status' | 'route_mode'>>): Promise<ServiceRow | null> {
    const sets: string[] = []
    const values: unknown[] = [id]
    const push = (col: string, v: unknown, json = false): void => {
      values.push(json ? JSON.stringify(v) : v)
      sets.push(`${col} = $${values.length}`)
    }
    if (input.name !== undefined) push('name', input.name)
    if (input.description !== undefined) push('description', input.description)
    if (input.scenario_id !== undefined) push('scenario_id', input.scenario_id)
    if (input.layers !== undefined) push('layers', input.layers, true)
    if (input.models !== undefined) push('models', input.models, true)
    if (input.status !== undefined) push('status', input.status)
    if (input.route_mode !== undefined) push('route_mode', input.route_mode)
    if (sets.length === 0) return this.getService(id)
    const r = await this.pool.query(`UPDATE ir_services SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, values)
    return r.rows[0] ?? null
  }

  async deleteService(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM ir_services WHERE id = $1', [id])
    return (r.rowCount ?? 0) > 0
  }

  // ---- logs ------------------------------------------------------------
  async logPredict(serviceId: string, query: string, result: unknown, matchedLayer: string | null, latencyMs: number): Promise<void> {
    await this.pool.query(
      'INSERT INTO ir_predict_logs (service_id, query, result, matched_layer, latency_ms) VALUES ($1,$2,$3,$4,$5)',
      [serviceId, query, JSON.stringify(result), matchedLayer, latencyMs],
    )
  }

  async listLogs(serviceId: string, limit = 50): Promise<Array<Record<string, unknown>>> {
    const r = await this.pool.query(
      'SELECT id, query, result, matched_layer, latency_ms, created_at FROM ir_predict_logs WHERE service_id = $1 ORDER BY id DESC LIMIT $2',
      [serviceId, limit],
    )
    return r.rows
  }
}
