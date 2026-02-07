/**
 * Simple API key authentication middleware.
 * Checks for APP_PASSWORD in x-api-key header or ?key= query param.
 * APP_PASSWORD MUST be set — server refuses to start without it.
 */
export function requireAuth(req, res, next) {
  // Skip auth for health check
  if (req.path === '/health') return next();

  // Skip auth for CORS preflight requests
  if (req.method === 'OPTIONS') return next();

  const password = process.env.APP_PASSWORD;

  // SECURITY: Refuse all requests if APP_PASSWORD is not configured
  if (!password) {
    console.error('FATAL: APP_PASSWORD environment variable is not set. All requests will be denied.');
    return res.status(500).json({ error: 'Server misconfigured. Authentication cannot be verified.' });
  }

  const apiKey = req.headers['x-api-key'] || req.query.key;

  if (apiKey === password) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized. Provide x-api-key header or ?key= param.' });
}
