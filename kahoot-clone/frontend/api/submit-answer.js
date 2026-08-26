import { getStore } from './_lib/store.js';
import { advance, submitAnswer } from './_lib/engine.js';
import { readJsonBody, sendJson, withErrorHandling, ApiError } from './_lib/http.js';

export default withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const { pin, playerId, choice } = await readJsonBody(req);
  if (!pin || !playerId || typeof choice !== 'number') {
    throw new ApiError(400, 'pin, playerId and numeric choice are required');
  }

  const store = await getStore();
  const result = await store.withGame(pin, (game, now) => {
    advance(game, now); // reject answers that arrive after the deadline
    submitAnswer(game, playerId, choice, now);
  });
  if (!result) throw new ApiError(404, 'Game not found');

  sendJson(res, 200, { success: true });
});
