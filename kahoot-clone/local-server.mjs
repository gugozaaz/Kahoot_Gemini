// Local development API server replacing the old Socket.IO backend.
// Serves the exact same route handlers Vercel runs in production, backed by
// the in-memory store (no database needed). Start it alongside the Vite dev
// server:
//   node local-server.mjs
//   cd frontend && npm run dev
import http from 'node:http';
import { getStore } from './frontend/api/_lib/store.js';
import createGameHandler from './frontend/api/create-game.js';
import joinGameHandler from './frontend/api/join-game.js';
import gameStateHandler from './frontend/api/game-state.js';
import hostActionHandler from './frontend/api/host-action.js';
import submitAnswerHandler from './frontend/api/submit-answer.js';

const routes = {
  '/api/create-game': createGameHandler,
  '/api/join-game': joinGameHandler,
  '/api/game-state': gameStateHandler,
  '/api/host-action': hostActionHandler,
  '/api/submit-answer': submitAnswerHandler,
};

const store = await getStore();
await store.init();
console.log(`Store: ${process.env.POSTGRES_URL || process.env.DATABASE_URL ? 'postgres' : 'in-memory'}`);

const PORT = process.env.PORT || 8787;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Vercel's runtime exposes parsed query params on req.query; mirror that here
  req.query = Object.fromEntries(url.searchParams);

  const handler = routes[url.pathname];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return;
  }
  try {
    await handler(req, res);
  } catch (err) {
    console.error(err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
  }
}).listen(PORT, () => {
  console.log(`Kahoot local API server listening on http://localhost:${PORT}`);
});
