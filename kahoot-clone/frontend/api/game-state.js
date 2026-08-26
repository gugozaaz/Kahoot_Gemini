import { getStore } from './_lib/store.js';
import { advance, assertHost, hostProjection, playerProjection } from './_lib/engine.js';
import { sendJson, withErrorHandling, ApiError } from './_lib/http.js';

// Time-sensitive phases need a lazy transition check (and persisting it);
// static phases are served read-only to keep polling cheap.
const LIVE_PHASES = ['QUESTION_PREVIEW', 'QUESTION_ACTIVE'];

export default withErrorHandling(async (req, res) => {
  if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
  const { pin, role, token } = req.query;
  if (!pin || !role || !token) {
    throw new ApiError(400, 'pin, role and token query params are required');
  }

  const store = await getStore();
  let row = await store.getGame(pin);
  if (!row) throw new ApiError(404, 'Game not found');

  if (LIVE_PHASES.includes(row.game.status)) {
    row = await store.withGame(pin, (game, now) => advance(game, now));
    if (!row) throw new ApiError(404, 'Game not found');
  }

  const now = Date.now();
  if (role === 'host') {
    assertHost(row.game, token);
    return sendJson(res, 200, hostProjection(row, now));
  }
  if (role === 'player') {
    return sendJson(res, 200, playerProjection(row, token, now));
  }
  throw new ApiError(400, 'role must be "host" or "player"');
});
