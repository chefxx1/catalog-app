const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
require('dotenv').config({ path: __dirname + '/../.env' });

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

module.exports = router;
