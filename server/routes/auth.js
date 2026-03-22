const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../db');
const auth = require('../middleware/auth');
require('dotenv').config({ path: __dirname + '/../.env' });

const { OAuth2Client } = require('google-auth-library');

const { sanitize, isValidEmail } = require('../middleware/validate');

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

function setAuthCookie(res, token) {
  res.cookie('token', token, COOKIE_OPTS);
}

const router = express.Router();

// Sign Up
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role, store_name } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (sanitize(name).length > 100) {
      return res.status(400).json({ error: 'Name must be under 100 characters' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters' });
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

    setAuthCookie(res, token);
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

    setAuthCookie(res, token);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, store_name: user.store_name }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout — clear cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out' });
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
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be 8-128 characters' });
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
    const { name: rawName, email, store_name: rawStore } = req.body;
    const name = rawName ? sanitize(rawName) : null;
    const store_name = rawStore ? sanitize(rawStore) : null;
    if (name && name.length > 100) return res.status(400).json({ error: 'Name must be under 100 characters' });
    if (store_name && store_name.length > 100) return res.status(400).json({ error: 'Store name must be under 100 characters' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (email) {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase().trim(), req.user.id]);
      if (existing.length > 0) return res.status(409).json({ error: 'Email already in use' });
    }
    await db.query(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), store_name = COALESCE(?, store_name) WHERE id = ?',
      [name || null, email?.toLowerCase().trim() || null, store_name || null, req.user.id]
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
    const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'BDT'];
    const validFormats = ['CSV', 'JSON', 'XML'];
    const validPlatforms = ['Shopify', 'WooCommerce', 'Magento', 'BigCommerce'];
    if (currency && !validCurrencies.includes(currency)) return res.status(400).json({ error: 'Invalid currency' });
    if (export_format && !validFormats.includes(export_format)) return res.status(400).json({ error: 'Invalid export format' });
    if (default_platform && !validPlatforms.includes(default_platform)) return res.status(400).json({ error: 'Invalid platform' });
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

// Forgot password — send reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Always return success to prevent email enumeration
    const successMsg = { message: 'If an account with that email exists, a reset link has been sent.' };

    const [users] = await db.query('SELECT id, name FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (users.length === 0) return res.json(successMsg);

    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing tokens for this user
    await db.query('UPDATE password_resets SET used = TRUE WHERE user_id = ?', [user.id]);

    await db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    const resetUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5173'}?reset=${token}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email.toLowerCase().trim(),
      subject: 'CatalogAI — Reset Your Password',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0F172A;border-radius:12px;color:#E2E8F0;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#10B981);line-height:40px;font-size:18px;color:white;font-weight:bold;">C</div>
            <h2 style="margin:12px 0 0;font-size:20px;color:#F8FAFC;">CatalogAI</h2>
          </div>
          <p style="font-size:15px;color:#94A3B8;">Hi ${user.name || 'there'},</p>
          <p style="font-size:15px;color:#94A3B8;">We received a request to reset your password. Click the button below to choose a new one:</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#2563EB;color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Reset Password</a>
          </div>
          <p style="font-size:13px;color:#64748B;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #1E293B;margin:24px 0;" />
          <p style="font-size:11px;color:#475569;text-align:center;">CatalogAI — AI-Powered Product Data Intelligence</p>
        </div>
      `,
    });

    res.json(successMsg);
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// Reset password — verify token and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8-128 characters' });

    const [resets] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    if (resets.length === 0) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

    const reset = resets[0];
    const hash = await bcrypt.hash(password, 12);

    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, reset.user_id]);
    await db.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [reset.id]);

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
