/**
 * Simple API key authentication middleware.
 * Checks for APP_PASSWORD in x-api-key header or ?key= query param.
 * Skips auth for /health endpoint and when APP_PASSWORD is not set.
 */
export function requireAuth(req, res, next) {
  // Skip auth for health check
  if (req.path === '/health') return next();

  const password = process.env.APP_PASSWORD;

  // If no password configured, allow all (dev mode)
  if (!password) return next();

  const apiKey = req.headers['x-api-key'] || req.query.key;

  if (apiKey === password) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized. Provide x-api-key header or ?key= param.' });
}
