const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../db');
const auth = require('../middleware/auth');
require('dotenv').config({ path: __dirname + '/../.env' });

const { OAuth2Client } = require('google-auth-library');

const requireRole = require('../middleware/requireRole');
const { sanitize, isValidEmail } = require('../middleware/validate');

// Precomputed bcrypt hash used to flatten signin timing on the no-such-user
// path — bcrypt.compare runs the same ~200ms work whether the email exists
// or not, so a timing-based attacker can't enumerate accounts.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('timing-flattener-never-used', 12);

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
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

// Hash one-time tokens (password resets) before storing so a DB read leak
// alone doesn't grant takeover. The plain token is mailed to the user once.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const router = express.Router();

// Sign Up — every signup creates a new store + Admin
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, store_name } = req.body;

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

    // Create store first
    const finalStoreName = store_name || 'My Store';
    const [storeResult] = await db.query('INSERT INTO stores (name) VALUES (?)', [finalStoreName]);
    const storeId = storeResult.insertId;

    // Create user as Admin of this store
    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role, store_id) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), password_hash, 'Admin', storeId]
    );

    const token = jwt.sign(
      { id: result.insertId, email: email.toLowerCase().trim(), role: 'Admin', store_id: storeId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    setAuthCookie(res, token);
    res.status(201).json({
      token,
      user: { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim(), role: 'Admin', store_id: storeId, store_name: finalStoreName }
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
    const user = users[0];
    // Constant-message + constant-time response. Don't tell an attacker whether
    // the email exists — collapse "no such user" and "wrong password" into one
    // generic error, and run bcrypt against a real precomputed hash on the
    // no-user path so the ~200ms work happens either way.
    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : (await bcrypt.compare(password, DUMMY_BCRYPT_HASH), false);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Fetch store name
    const [stores] = await db.query('SELECT name FROM stores WHERE id = ?', [user.store_id]);
    const storeName = stores.length ? stores[0].name : 'My Store';

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, store_id: user.store_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    setAuthCookie(res, token);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id, store_name: storeName }
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
    const [users] = await db.query(
      'SELECT u.id, u.name, u.email, u.role, u.store_id, s.name AS store_name, u.created_at FROM users u JOIN stores s ON u.store_id = s.id WHERE u.id = ?',
      [req.user.id]
    );
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
    // Update user fields
    await db.query(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?',
      [name || null, email?.toLowerCase().trim() || null, req.user.id]
    );
    // Update store name (Admin only)
    if (store_name) {
      const [userRow] = await db.query('SELECT role, store_id FROM users WHERE id = ?', [req.user.id]);
      if (userRow[0].role === 'Admin') {
        await db.query('UPDATE stores SET name = ? WHERE id = ?', [store_name, userRow[0].store_id]);
      }
    }
    const [updated] = await db.query(
      'SELECT u.id, u.name, u.email, u.role, u.store_id, s.name AS store_name FROM users u JOIN stores s ON u.store_id = s.id WHERE u.id = ?',
      [req.user.id]
    );
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

// Update settings (upsert) — Admin only
router.put('/settings', auth, requireRole('Admin'), async (req, res) => {
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

// Delete all catalog data (Danger Zone) — Admin only, deletes entire store's data
router.delete('/data', auth, requireRole('Admin'), async (req, res) => {
  try {
    const sid = req.user.store_id;
    await db.query('DELETE FROM exports WHERE store_id = ?', [sid]);
    await db.query('DELETE FROM catalog_entries WHERE store_id = ?', [sid]);
    await db.query('DELETE FROM search_history WHERE store_id = ?', [sid]);
    await db.query('DELETE FROM brand_voices WHERE store_id = ?', [sid]);
    // user_settings stays user_id scoped — delete for all store members
    const [members] = await db.query('SELECT id FROM users WHERE store_id = ?', [sid]);
    for (const m of members) {
      await db.query('DELETE FROM user_settings WHERE user_id = ?', [m.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete data error:', err.message);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

// Delete account (Danger Zone) — Admin deletes entire store + all members
router.delete('/account', auth, requireRole('Admin'), async (req, res) => {
  try {
    // Deleting the store cascades to all users, data, and invitations
    await db.query('DELETE FROM stores WHERE id = ?', [req.user.store_id]);
    res.clearCookie('token', { path: '/' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── Team Management (Admin only) ──

// List store members
router.get('/team', auth, requireRole('Admin'), async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE store_id = ? ORDER BY created_at ASC',
      [req.user.store_id]
    );
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change user role (must be in same store)
router.patch('/team/:id/role', auth, requireRole('Admin'), async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't change your own role" });
    }

    const { role } = req.body;
    const validRoles = ['Admin', 'Editor', 'Viewer'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be Admin, Editor, or Viewer' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE id = ? AND store_id = ?', [targetId, req.user.store_id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    const [owner] = await db.query('SELECT id FROM users WHERE store_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [req.user.store_id]);
    if (owner.length && owner[0].id === targetId) return res.status(403).json({ error: "Cannot change the store owner's role" });

    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove user from store (cascade deletes their personal data)
router.delete('/team/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't remove yourself" });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE id = ? AND store_id = ?', [targetId, req.user.store_id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    const [owner] = await db.query('SELECT id FROM users WHERE store_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [req.user.store_id]);
    if (owner.length && owner[0].id === targetId) return res.status(403).json({ error: "Cannot remove the store owner" });

    // Delete user — FK cascades handle user_settings, password_resets
    await db.query('DELETE FROM users WHERE id = ?', [targetId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Remove user error:', err.message);
    res.status(500).json({ error: 'Failed to remove user' });
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
      const [stores] = await db.query('SELECT name FROM stores WHERE id = ?', [user.store_id]);
      const storeName = stores.length ? stores[0].name : 'My Store';

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, store_id: user.store_id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      setAuthCookie(res, token);
      return res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id, store_name: storeName }
      });
    }

    // New user via Google — check if there's a pending invitation
    const [pendingInvite] = await db.query(
      'SELECT * FROM invitations WHERE email = ? AND accepted = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email]
    );

    let storeId, assignedRole;
    if (pendingInvite.length > 0) {
      // Accept the invitation — join the inviter's store
      storeId = pendingInvite[0].store_id;
      assignedRole = pendingInvite[0].role;
      await db.query('UPDATE invitations SET accepted = TRUE WHERE id = ?', [pendingInvite[0].id]);
    } else {
      // No invitation — create a new store as Admin
      const [storeResult] = await db.query('INSERT INTO stores (name) VALUES (?)', ['My Store']);
      storeId = storeResult.insertId;
      assignedRole = 'Admin';
    }

    const randomHash = await bcrypt.hash(Math.random().toString(36), 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role, store_id) VALUES (?, ?, ?, ?, ?)',
      [name, email, randomHash, assignedRole, storeId]
    );

    const [stores] = await db.query('SELECT name FROM stores WHERE id = ?', [storeId]);
    const storeName = stores.length ? stores[0].name : 'My Store';

    const token = jwt.sign(
      { id: result.insertId, email, role: assignedRole, store_id: storeId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    setAuthCookie(res, token);
    res.status(201).json({
      token,
      user: { id: result.insertId, name, email, role: assignedRole, store_id: storeId, store_name: storeName }
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

    // Store only the hash; plain token goes to the user's email
    await db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, hashToken(token), expiresAt]
    );

    const resetUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5173'}?reset=${token}`;
    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Don't crash if SMTP isn't configured — log it and still report success
    // (the email enumeration story stays consistent: caller can't tell the
    // difference between "no account exists" and "SMTP failed").
    try {
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
            <p style="font-size:15px;color:#94A3B8;">Hi ${escHtml(user.name) || 'there'},</p>
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
    } catch (mailErr) {
      console.warn('Reset email failed (token still valid):', mailErr.message);
    }

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
      [hashToken(token)]
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

// ── Invite System ──

// Send invitation (Admin only)
router.post('/invite', auth, requireRole('Admin'), async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

    const validRoles = ['Editor', 'Viewer'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be Editor or Viewer' });
    }

    // Check if email already registered
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'A user with this email already has an account' });
    }

    // Check for pending invite to same email in same store
    const [pendingInvite] = await db.query(
      'SELECT id FROM invitations WHERE email = ? AND store_id = ? AND accepted = FALSE AND expires_at > NOW()',
      [email.toLowerCase().trim(), req.user.store_id]
    );
    if (pendingInvite.length > 0) {
      return res.status(409).json({ error: 'An invitation is already pending for this email' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.query(
      'INSERT INTO invitations (store_id, inviter_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.store_id, req.user.id, email.toLowerCase().trim(), role, token, expiresAt]
    );

    // Get store name and inviter name for the email
    const [stores] = await db.query('SELECT name FROM stores WHERE id = ?', [req.user.store_id]);
    const storeName = stores[0]?.name || 'a store';
    const [inviter] = await db.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const inviterName = inviter[0]?.name || 'Your teammate';

    const inviteUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5173'}?invite=${token}`;
    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let emailSent = false;
    let emailError = null;
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email.toLowerCase().trim(),
        subject: `CatalogAI — You've been invited to join ${escHtml(storeName)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0F172A;border-radius:12px;color:#E2E8F0;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#2563EB,#10B981);line-height:40px;font-size:18px;color:white;font-weight:bold;">C</div>
              <h2 style="margin:12px 0 0;font-size:20px;color:#F8FAFC;">CatalogAI</h2>
            </div>
            <p style="font-size:15px;color:#94A3B8;">Hi there,</p>
            <p style="font-size:15px;color:#94A3B8;"><strong style="color:#F8FAFC;">${escHtml(inviterName)}</strong> has invited you to join <strong style="color:#F8FAFC;">${escHtml(storeName)}</strong> as an <strong style="color:#F8FAFC;">${escHtml(role)}</strong>.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${inviteUrl}" style="display:inline-block;padding:12px 32px;background:#2563EB;color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Accept Invitation</a>
            </div>
            <p style="font-size:13px;color:#64748B;">This invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid #1E293B;margin:24px 0;" />
            <p style="font-size:11px;color:#475569;text-align:center;">CatalogAI — AI-Powered Product Data Intelligence</p>
          </div>
        `,
      });
      emailSent = true;
    } catch (mailErr) {
      // Invite row is already saved — surface the link so admin can share manually
      emailError = mailErr.message;
      console.warn('Invite email failed (link still valid):', mailErr.message);
    }

    res.json({ success: true, emailSent, emailError, inviteUrl, message: emailSent ? 'Invitation sent' : 'Invite created — email could not be sent. Share the link manually.' });
  } catch (err) {
    console.error('Invite error:', err.message);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Validate invite token (public — no auth)
router.get('/invite/:token', async (req, res) => {
  try {
    const [invites] = await db.query(
      `SELECT i.email, i.role, s.name AS store_name, u.name AS inviter_name
       FROM invitations i
       JOIN stores s ON i.store_id = s.id
       JOIN users u ON i.inviter_id = u.id
       WHERE i.token = ? AND i.accepted = FALSE AND i.expires_at > NOW()`,
      [req.params.token]
    );
    if (invites.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }
    res.json(invites[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept invitation and create account (public — no auth)
// Uses a transaction with a conditional UPDATE to claim the invite atomically:
// two concurrent accepts (or accept-during-revocation) cannot both succeed.
router.post('/invite/:token/accept', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Name and password are required' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8-128 characters' });

    await conn.beginTransaction();

    // Atomic claim: only one caller wins (affectedRows === 1).
    const [claim] = await conn.query(
      'UPDATE invitations SET accepted = TRUE WHERE token = ? AND accepted = FALSE AND expires_at > NOW()',
      [req.params.token]
    );
    if (claim.affectedRows !== 1) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    const [invites] = await conn.query(
      'SELECT id, email, role, store_id FROM invitations WHERE token = ?',
      [req.params.token]
    );
    const invite = invites[0];

    // Check if email already registered
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [invite.email]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role, store_id) VALUES (?, ?, ?, ?, ?)',
      [sanitize(name).slice(0, 100), invite.email, password_hash, invite.role, invite.store_id]
    );

    // Get store name
    const [stores] = await conn.query('SELECT name FROM stores WHERE id = ?', [invite.store_id]);
    const storeName = stores[0]?.name || 'My Store';

    await conn.commit();

    const token = jwt.sign(
      { id: result.insertId, email: invite.email, role: invite.role, store_id: invite.store_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    setAuthCookie(res, token);
    res.status(201).json({
      token,
      user: { id: result.insertId, name: name.trim(), email: invite.email, role: invite.role, store_id: invite.store_id, store_name: storeName }
    });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('Accept invite error:', err.message);
    res.status(500).json({ error: 'Failed to create account' });
  } finally {
    conn.release();
  }
});

// List pending invitations (Admin only)
router.get('/invites', auth, requireRole('Admin'), async (req, res) => {
  try {
    const [invites] = await db.query(
      'SELECT id, email, role, accepted, created_at, expires_at FROM invitations WHERE store_id = ? ORDER BY created_at DESC',
      [req.user.store_id]
    );
    res.json({ invites });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Revoke invitation (Admin only)
router.delete('/invites/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM invitations WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
