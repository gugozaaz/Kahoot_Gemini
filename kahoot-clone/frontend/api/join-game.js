import { getStore } from './_lib/store.js';
import { joinPlayer } from './_lib/engine.js';
import { readJsonBody, sendJson, withErrorHandling, ApiError } from './_lib/http.js';

export default withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const { pin, nickname } = await readJsonBody(req);
  if (!pin || !nickname) throw new ApiError(400, 'pin and nickname are required');

  const store = await getStore();
  const playerId = crypto.randomUUID();
  const result = await store.withGame(pin, (game, now) => {
    joinPlayer(game, playerId, nickname, now);
  });
  if (!result) throw new ApiError(404, 'Game not found');

  sendJson(res, 200, { success: true, pin, playerId });
});
