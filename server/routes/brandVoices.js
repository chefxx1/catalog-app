const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const logActivity = require('../helpers/activity');
const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');

const router = express.Router();

// List user's voices
router.get('/', auth, async (req, res) => {
  try {
    const [voices] = await db.query(
      'SELECT * FROM brand_voices WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );
    res.json({ voices });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create voice
router.post('/', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { name: rawName, tone, description: rawDesc, is_default, metadata } = req.body;
    if (!rawName) return res.status(400).json({ error: 'Name is required' });
    const name = sanitize(rawName);
    const description = rawDesc ? sanitize(rawDesc) : null;
    if (name.length > 100) return res.status(400).json({ error: 'Name must be under 100 characters' });
    if (description && description.length > 2000) return res.status(400).json({ error: 'Description must be under 2000 characters' });

    // If setting as default, unset only THIS user's other defaults — voices
    // are user-scoped, so we shouldn't nuke other store members' defaults.
    if (is_default) {
      await db.query('UPDATE brand_voices SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    }

    const [result] = await db.query(
      'INSERT INTO brand_voices (store_id, user_id, name, tone, description, is_default, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.store_id, req.user.id, name, tone || 'Professional', description || null, is_default || false, JSON.stringify(metadata || null)]
    );

    const [created] = await db.query('SELECT * FROM brand_voices WHERE id = ?', [result.insertId]);
    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'created', entity_type: 'brand_voice', entity_id: result.insertId, entity_name: name });
    res.status(201).json({ voice: created[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update voice
router.put('/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { name: rawName, tone, description: rawDesc, is_default, metadata } = req.body;
    const name = rawName ? sanitize(rawName) : null;
    const description = rawDesc !== undefined ? (rawDesc ? sanitize(rawDesc) : rawDesc) : undefined;
    if (name && name.length > 100) return res.status(400).json({ error: 'Name must be under 100 characters' });
    if (description && description.length > 2000) return res.status(400).json({ error: 'Description must be under 2000 characters' });

    // Verify ownership — voices are user-scoped
    const [existing] = await db.query('SELECT * FROM brand_voices WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Voice not found' });

    // If setting as default, unset only THIS user's other defaults
    if (is_default) {
      await db.query('UPDATE brand_voices SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
    }

    await db.query(
      'UPDATE brand_voices SET name = ?, tone = ?, description = ?, is_default = ?, metadata = ? WHERE id = ? AND user_id = ?',
      [name || existing[0].name, tone || existing[0].tone, description ?? existing[0].description,
       is_default ?? existing[0].is_default, JSON.stringify(metadata || null), req.params.id, req.user.id]
    );

    const [updated] = await db.query('SELECT * FROM brand_voices WHERE id = ?', [req.params.id]);
    res.json({ voice: updated[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete voice — only the owner can delete
router.delete('/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [existing] = await db.query('SELECT * FROM brand_voices WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Voice not found' });

    await db.query('DELETE FROM brand_voices WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'deleted', entity_type: 'brand_voice', entity_id: parseInt(req.params.id, 10), entity_name: existing[0].name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
