import { getStore } from './_lib/store.js';
import { newGame, generatePIN } from './_lib/engine.js';
import { readJsonBody, sendJson, withErrorHandling, ApiError } from './_lib/http.js';

export default withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const { questions } = await readJsonBody(req);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new ApiError(400, 'questions array is required');
  }

  const store = await getStore();
  const hostId = crypto.randomUUID();
  const now = Date.now();

  // Retry until we find a free pin
  for (let attempt = 0; attempt < 10; attempt++) {
    const game = newGame(generatePIN(), hostId, questions, now);
    const created = await store.createGame(game);
    if (created) {
      return sendJson(res, 200, { success: true, pin: game.pin, hostId });
    }
  }
  throw new ApiError(500, 'Could not allocate a free PIN');
});
