const jwt = require('jsonwebtoken');
require('dotenv').config({ path: __dirname + '/../.env' });

const auth = (req, res, next) => {
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
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = auth;
