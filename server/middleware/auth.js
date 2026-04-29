const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config({ path: __dirname + '/../.env' });

const auth = async (req, res, next) => {
  // Read token from httpOnly cookie first, fall back to Authorization header
  let token = req.cookies?.token;
  if (!token) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Always re-verify the user exists. A token outliving its user (deleted
    // account, removed team member) must not silently scope queries to NULL.
    const [rows] = await db.query('SELECT id, store_id FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    // Backfill store_id from DB (covers old JWTs without it, and keeps it fresh)
    decoded.store_id = rows[0].store_id;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = auth;
