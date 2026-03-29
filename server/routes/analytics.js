const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const [totalProducts] = await db.query('SELECT COUNT(*) as count FROM catalog_entries WHERE store_id = ?', [req.user.store_id]);
    const [exported] = await db.query("SELECT COUNT(*) as count FROM catalog_entries WHERE store_id = ? AND status = 'Exported'", [req.user.store_id]);
    const [searches] = await db.query('SELECT COUNT(*) as count FROM search_history WHERE store_id = ?', [req.user.store_id]);
    const [cacheHits] = await db.query('SELECT COUNT(*) as count FROM search_history WHERE store_id = ? AND cache_hit = TRUE', [req.user.store_id]);
    const [avgTime] = await db.query('SELECT AVG(response_time_ms) as avg_ms FROM search_history WHERE store_id = ?', [req.user.store_id]);

    const cacheHitRate = searches[0].count > 0 ? Math.round((cacheHits[0].count / searches[0].count) * 100) : 0;

    res.json({
      total_products: totalProducts[0].count,
      published: exported[0].count,
      total_searches: searches[0].count,
      cache_hit_rate: cacheHitRate,
      avg_response_time: Math.round(avgTime[0].avg_ms || 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Source performance
router.get('/sources', auth, async (req, res) => {
  try {
    const [sources] = await db.query(
      `SELECT ps.source_name, COUNT(*) as total, AVG(ps.trust_score) as avg_trust
       FROM product_sources ps
       JOIN catalog_entries ce ON ce.product_id = ps.product_id
       WHERE ce.store_id = ?
       GROUP BY ps.source_name ORDER BY avg_trust DESC`,
      [req.user.store_id]
    );
    res.json({ sources });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Recent searches
router.get('/searches', auth, async (req, res) => {
  try {
    const [history] = await db.query(
      'SELECT * FROM search_history WHERE store_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.store_id]
    );
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete search history (cleanup)
router.delete('/searches', auth, requireRole('Admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM search_history WHERE store_id = ?', [req.user.store_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Auto-purge old search records (keep last 90 days)
router.post('/searches/cleanup', auth, requireRole('Admin'), async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM search_history WHERE store_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)',
      [req.user.store_id]
    );
    res.json({ success: true, deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
