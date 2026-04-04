const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');

const router = express.Router();

// ── TAGS ──

// Get all tags for store
router.get('/tags', auth, async (req, res) => {
  try {
    const [tags] = await db.query(
      'SELECT t.*, COUNT(cet.catalog_entry_id) as entry_count FROM tags t LEFT JOIN catalog_entry_tags cet ON cet.tag_id = t.id WHERE t.store_id = ? GROUP BY t.id ORDER BY t.name',
      [req.user.store_id]
    );
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create tag
router.post('/tags', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const name = sanitize(String(req.body.name || '')).slice(0, 50).trim();
    const color = (req.body.color || '#3B82F6').slice(0, 7);
    if (!name) return res.status(400).json({ error: 'Tag name required' });

    const [result] = await db.query(
      'INSERT INTO tags (store_id, name, color) VALUES (?, ?, ?)',
      [req.user.store_id, name, color]
    );
    res.status(201).json({ id: result.insertId, name, color, entry_count: 0 });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tag already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Update tag
router.put('/tags/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const name = req.body.name ? sanitize(String(req.body.name)).slice(0, 50).trim() : undefined;
    const color = req.body.color ? req.body.color.slice(0, 7) : undefined;
    const fields = [];
    const values = [];
    if (name) { fields.push('name = ?'); values.push(name); }
    if (color) { fields.push('color = ?'); values.push(color); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id, req.user.store_id);
    await db.query(`UPDATE tags SET ${fields.join(', ')} WHERE id = ? AND store_id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tag name already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete tag
router.delete('/tags/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    await db.query('DELETE FROM tags WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign tags to a catalog entry
router.post('/entries/:entryId/tags', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { tagIds } = req.body;
    if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds must be an array' });

    // Verify entry belongs to store
    const [entry] = await db.query('SELECT id FROM catalog_entries WHERE id = ? AND store_id = ?', [req.params.entryId, req.user.store_id]);
    if (entry.length === 0) return res.status(404).json({ error: 'Entry not found' });

    // Clear existing and re-assign
    await db.query('DELETE FROM catalog_entry_tags WHERE catalog_entry_id = ?', [req.params.entryId]);
    if (tagIds.length > 0) {
      const values = tagIds.map(tid => [parseInt(req.params.entryId), parseInt(tid)]);
      await db.query('INSERT INTO catalog_entry_tags (catalog_entry_id, tag_id) VALUES ?', [values]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get tags for a catalog entry
router.get('/entries/:entryId/tags', auth, async (req, res) => {
  try {
    const [tags] = await db.query(
      'SELECT t.* FROM tags t JOIN catalog_entry_tags cet ON cet.tag_id = t.id WHERE cet.catalog_entry_id = ?',
      [req.params.entryId]
    );
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── SAVED VIEWS ──

// Get saved views
router.get('/views', auth, async (req, res) => {
  try {
    const [views] = await db.query(
      'SELECT * FROM saved_views WHERE store_id = ? ORDER BY created_at DESC',
      [req.user.store_id]
    );
    res.json({ views: views.map(v => ({ ...v, filters: typeof v.filters === 'string' ? JSON.parse(v.filters) : v.filters })) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create saved view
router.post('/views', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const name = sanitize(String(req.body.name || '')).slice(0, 100).trim();
    const filters = req.body.filters;
    if (!name) return res.status(400).json({ error: 'View name required' });
    if (!filters) return res.status(400).json({ error: 'Filters required' });

    const [result] = await db.query(
      'INSERT INTO saved_views (store_id, user_id, name, filters) VALUES (?, ?, ?, ?)',
      [req.user.store_id, req.user.id, name, JSON.stringify(filters)]
    );
    res.status(201).json({ id: result.insertId, name, filters });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete saved view
router.delete('/views/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    await db.query('DELETE FROM saved_views WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── ACTIVITY FEED ──

// Get recent activity for store
router.get('/activity', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const entityType = req.query.entity_type || null;
    const entityId = req.query.entity_id || null;

    let query = `SELECT al.*, u.name as user_name FROM activity_log al JOIN users u ON u.id = al.user_id WHERE al.store_id = ?`;
    const params = [req.user.store_id];

    if (entityType) { query += ' AND al.entity_type = ?'; params.push(entityType); }
    if (entityId) { query += ' AND al.entity_id = ?'; params.push(entityId); }

    query += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(limit);

    const [activity] = await db.query(query, params);
    res.json({ activity: activity.map(a => ({ ...a, details: typeof a.details === 'string' ? JSON.parse(a.details) : a.details })) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
