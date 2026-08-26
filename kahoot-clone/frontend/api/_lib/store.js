// Storage adapter selector.
// Production (Vercel): POSTGRES_URL / DATABASE_URL (Neon via Vercel Marketplace)
// Local dev / docker: falls back to an in-memory store.

let instance = null;

export async function getStore() {
  if (instance) return instance;
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (url) {
    const { PgStore } = await import('./pgstore.js');
    instance = new PgStore(url);
  } else {
    const { MemoryStore } = await import('./memstore.js');
    instance = new MemoryStore();
  }
  return instance;
}

/**
 * Every store implements:
 *   createGame(game) -> Promise<boolean>   false if the pin already exists
 *   withGame(pin, mutator) -> Promise<{ version, game } | null>
 *     Reads the game, lets `mutator(game)` mutate it in place (may throw
 *     { statusCode, message } for request errors), persists it with
 *     optimistic concurrency on `version`, retries on conflict.
 *     Returns null when the pin is unknown.
 */
