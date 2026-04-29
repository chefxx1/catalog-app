const crypto = require('crypto');

const store = new Map();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of store) {
    if (now > data.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

// Per-token keying (without verifying the JWT — it's just for bucket isolation,
// not auth). If the cookie is missing we fall back to IP. This way one client
// behind a shared proxy IP doesn't get throttled by another's traffic.
function tokenFingerprint(req) {
  const cookie = req.cookies?.token;
  const header = req.headers.authorization;
  const raw = cookie || (header && header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function rateLimit({ max = 60, windowMs = 60000, message = 'Too many requests, please try again later' } = {}) {
  return (req, res, next) => {
    const id = tokenFingerprint(req) || `ip:${req.ip}`;
    const key = `${id}:${req.baseUrl}`;
    const now = Date.now();
    let record = store.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      store.set(key, record);
    }

    record.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: message });
    }

    next();
  };
}

module.exports = rateLimit;
