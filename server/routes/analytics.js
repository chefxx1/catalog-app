const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const [totalProducts] = await db.query('SELECT COUNT(*) as count FROM catalog_entries WHERE user_id = ?', [req.user.id]);
    const [exported] = await db.query("SELECT COUNT(*) as count FROM catalog_entries WHERE user_id = ? AND status = 'Exported'", [req.user.id]);
    const [searches] = await db.query('SELECT COUNT(*) as count FROM search_history WHERE user_id = ?', [req.user.id]);
    const [cacheHits] = await db.query('SELECT COUNT(*) as count FROM search_history WHERE user_id = ? AND cache_hit = TRUE', [req.user.id]);
    const [avgTime] = await db.query('SELECT AVG(response_time_ms) as avg_ms FROM search_history WHERE user_id = ?', [req.user.id]);

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
      `SELECT source_name, COUNT(*) as total, AVG(trust_score) as avg_trust
       FROM product_sources GROUP BY source_name ORDER BY avg_trust DESC`
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
      'SELECT * FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
