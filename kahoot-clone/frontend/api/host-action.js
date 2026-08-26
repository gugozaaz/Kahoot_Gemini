import { getStore } from './_lib/store.js';
import { advance, assertHost, hostAction, hostProjection } from './_lib/engine.js';
import { readJsonBody, sendJson, withErrorHandling, ApiError } from './_lib/http.js';

export default withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const { pin, hostId, action } = await readJsonBody(req);
  if (!pin || !hostId || !action) {
    throw new ApiError(400, 'pin, hostId and action are required');
  }

  const store = await getStore();
  const result = await store.withGame(pin, (game, now) => {
    advance(game, now);
    assertHost(game, hostId);
    hostAction(game, action, now);
  });
  if (!result) throw new ApiError(404, 'Game not found');

  // Return the fresh state so the host UI updates immediately,
  // without waiting for the next poll.
  sendJson(res, 200, {
    success: true,
    state: hostProjection(result, Date.now())
  });
});
