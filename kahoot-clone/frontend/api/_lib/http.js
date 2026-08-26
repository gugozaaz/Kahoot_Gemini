// Small helpers shared by all API routes.

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (chunks.reduce((n, c) => n + c.length, 0) > 1e6) {
      throw new ApiError(413, 'Payload too large');
    }
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
}

// Wraps a route handler so thrown ApiErrors become JSON responses.
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        sendJson(res, err.statusCode, { success: false, error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { success: false, error: 'Internal server error' });
      }
    }
  };
}
