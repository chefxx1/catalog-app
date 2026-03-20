const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
require('dotenv').config({ path: __dirname + '/../.env' });

const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

// Sign Up
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role, store_name } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password and create user
    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role, store_name) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), password_hash, role || 'Editor', store_name || 'My Store']
    );

    const token = jwt.sign(
      { id: result.insertId, email: email.toLowerCase().trim(), role: role || 'Editor' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      token,
      user: { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim(), role: role || 'Editor', store_name: store_name || 'My Store' }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Sign In
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, store_name: user.store_name }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, email, role, store_name, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: users[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const [users] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, store_name } = req.body;
    if (email) {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase().trim(), req.user.id]);
      if (existing.length > 0) return res.status(409).json({ error: 'Email already in use' });
    }
    await db.query(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), store_name = COALESCE(?, store_name) WHERE id = ?',
      [name?.trim() || null, email?.toLowerCase().trim() || null, store_name?.trim() || null, req.user.id]
    );
    const [updated] = await db.query('SELECT id, name, email, role, store_name FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get settings
router.get('/settings', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.json({
        currency: 'USD', export_format: 'CSV', default_platform: 'Shopify',
        notif_export: true, notif_weekly: true, notif_new_source: false, notif_price_conflict: true
      });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update settings (upsert)
router.put('/settings', auth, async (req, res) => {
  try {
    const { currency, export_format, default_platform, notif_export, notif_weekly, notif_new_source, notif_price_conflict } = req.body;
    await db.query(
      `INSERT INTO user_settings (user_id, currency, export_format, default_platform, notif_export, notif_weekly, notif_new_source, notif_price_conflict)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE currency=VALUES(currency), export_format=VALUES(export_format), default_platform=VALUES(default_platform),
       notif_export=VALUES(notif_export), notif_weekly=VALUES(notif_weekly), notif_new_source=VALUES(notif_new_source), notif_price_conflict=VALUES(notif_price_conflict)`,
      [req.user.id, currency || 'USD', export_format || 'CSV', default_platform || 'Shopify',
       notif_export ?? true, notif_weekly ?? true, notif_new_source ?? false, notif_price_conflict ?? true]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete all catalog data (Danger Zone)
router.delete('/data', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM exports WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM catalog_entries WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM search_history WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM brand_voices WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM user_settings WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete data error:', err.message);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

// Delete account (Danger Zone)
router.delete('/account', auth, async (req, res) => {
  try {
    // Cascading deletes handle most child rows, but be explicit for safety
    await db.query('DELETE FROM exports WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM catalog_entries WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM search_history WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM brand_voices WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM user_settings WHERE user_id = ?', [req.user.id]);
    await db.query('DELETE FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Google OAuth
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential is required' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'Google OAuth not configured' });

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();

    const email = payload.email.toLowerCase().trim();
    const name = payload.name || email.split('@')[0];

    // Check if user exists
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (existing.length > 0) {
      // Existing user — sign in
      const user = existing[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      return res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, store_name: user.store_name }
      });
    }

    // New user — create account (no password needed for Google users)
    const randomHash = await bcrypt.hash(Math.random().toString(36), 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role, store_name) VALUES (?, ?, ?, ?, ?)',
      [name, email, randomHash, 'Editor', 'My Store']
    );

    const token = jwt.sign(
      { id: result.insertId, email, role: 'Editor' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      token,
      user: { id: result.insertId, name, email, role: 'Editor', store_name: 'My Store' }
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

module.exports = router;
