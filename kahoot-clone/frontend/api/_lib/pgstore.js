// Postgres store for production (Neon via Vercel Marketplace).
// One JSONB row per game with optimistic concurrency on `version`.

import pg from 'pg';

const MAX_ATTEMPTS = 5;

export class PgStore {
  constructor(connectionString) {
    // Cache the pool on globalThis so warm serverless invocations reuse it.
    const g = globalThis;
    if (!g.__kahootPool) {
      g.__kahootPool = new pg.Pool({
        connectionString,
        max: 3,
        ssl: { rejectUnauthorized: false },
      });
    }
    this.pool = g.__kahootPool;
    this.ready = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = this.pool.query(`
        CREATE TABLE IF NOT EXISTS games (
          pin TEXT PRIMARY KEY,
          version INTEGER NOT NULL DEFAULT 1,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    }
    await this.ready;
  }

  async createGame(game) {
    await this.init();
    try {
      await this.pool.query(
        'INSERT INTO games (pin, version, data) VALUES ($1, 1, $2)',
        [game.pin, JSON.stringify(game)]
      );
      // Questions may embed large base64 images; prune games older than a day
      // so the free-tier database does not fill up.
      await this.pool.query("DELETE FROM games WHERE created_at < now() - interval '24 hours'");
      return true;
    } catch (err) {
      if (err.code === '23505') return false; // unique_violation: pin taken
      throw err;
    }
  }

  async getGame(pin) {
    await this.init();
    const { rows } = await this.pool.query(
      'SELECT version, data FROM games WHERE pin = $1',
      [pin]
    );
    return rows.length === 0 ? null : { version: rows[0].version, game: rows[0].data };
  }

  async withGame(pin, mutator) {
    await this.init();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { rows } = await this.pool.query(
        'SELECT version, data FROM games WHERE pin = $1',
        [pin]
      );
      if (rows.length === 0) return null;
      const { version, data } = rows[0];

      mutator(data, Date.now());

      const updated = await this.pool.query(
        `UPDATE games SET version = version + 1, data = $2
         WHERE pin = $1 AND version = $3`,
        [pin, JSON.stringify(data), version]
      );
      if (updated.rowCount > 0) {
        return { version: version + 1, game: data };
      }
      // Version conflict: another request won the race, retry with fresh read.
    }
    throw new Error('Too many concurrent updates');
  }
}
