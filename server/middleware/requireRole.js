const db = require('../db');

// Role-checking middleware — chain after auth middleware
// Usage: router.post('/route', auth, requireRole('Admin', 'Editor'), handler)
const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Read current role from DB (not JWT) so role changes take effect immediately
    try {
      const [rows] = await db.query('SELECT role, store_id FROM users WHERE id = ?', [req.user.id]);
      if (rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const currentRole = rows[0].role;
      req.user.role = currentRole; // Update req.user with fresh role
      req.user.store_id = rows[0].store_id; // Always fresh store_id

      if (!allowedRoles.includes(currentRole)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action' });
      }

      next();
    } catch (err) {
      console.error('Role check error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  };
};

module.exports = requireRole;
