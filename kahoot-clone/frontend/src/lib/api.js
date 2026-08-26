// HTTP client replacing the old Socket.IO transport.
// All calls are same-origin: Vercel serves /api/* functions in production,
// and the Vite dev server proxies /api/* to the local dev server.

async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  createGame: (questions) =>
    request('/api/create-game', { method: 'POST', body: JSON.stringify({ questions }) }),

  joinGame: (pin, nickname) =>
    request('/api/join-game', { method: 'POST', body: JSON.stringify({ pin, nickname }) }),

  getGameState: ({ pin, role, token }) =>
    request(`/api/game-state?pin=${encodeURIComponent(pin)}&role=${role}&token=${encodeURIComponent(token)}`),

  hostAction: (pin, hostId, action) =>
    request('/api/host-action', { method: 'POST', body: JSON.stringify({ pin, hostId, action }) }),

  submitAnswer: (pin, playerId, choice) =>
    request('/api/submit-answer', { method: 'POST', body: JSON.stringify({ pin, playerId, choice }) }),
};
