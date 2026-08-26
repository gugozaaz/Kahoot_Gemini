// Simple in-memory store for local development (no database needed).
// Game state lives for the lifetime of the process only.

const MAX_ATTEMPTS = 5;

export class MemoryStore {
  constructor() {
    this.games = new Map(); // pin -> { version, game }
  }

  async init() {} // parity with PgStore

  async createGame(game) {
    if (this.games.has(game.pin)) return false;
    this.games.set(game.pin, { version: 1, game });
    return true;
  }

  async getGame(pin) {
    return this.games.get(pin) || null;
  }

  async withGame(pin, mutator) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = this.games.get(pin);
      if (!row) return null;
      mutator(row.game, Date.now());
      row.version++;
      return { version: row.version, game: row.game };
    }
    throw new Error('Too many concurrent updates');
  }
}
