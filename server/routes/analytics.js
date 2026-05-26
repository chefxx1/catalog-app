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
       WHERE ce.store_id = ? AND ps.source_name IS NOT NULL AND ps.source_name != ''
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

// Catalog completeness overview (for dashboard donut)
router.get('/completeness', auth, async (req, res) => {
  try {
    // Score each entry 0-100 in SQL and bucket in a single aggregate query so
    // we never pull every row into Node just to count buckets.
    const [[r]] = await db.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(ROUND(AVG(score)), 0) AS average,
         SUM(CASE WHEN score = 100 THEN 1 ELSE 0 END) AS complete,
         SUM(CASE WHEN score >= 70 AND score < 100 THEN 1 ELSE 0 END) AS good,
         SUM(CASE WHEN score >= 40 AND score < 70 THEN 1 ELSE 0 END) AS needsWork,
         SUM(CASE WHEN score < 40 THEN 1 ELSE 0 END) AS poor
       FROM (
         SELECT
           (CASE WHEN (ce.custom_name IS NOT NULL AND ce.custom_name <> '') OR (p.name IS NOT NULL AND p.name <> '') THEN 15 ELSE 0 END) +
           (CASE WHEN (ce.custom_description IS NOT NULL AND ce.custom_description <> '')
                      OR (p.description IS NOT NULL AND p.description <> '')
                      OR (p.ai_description_professional IS NOT NULL AND p.ai_description_professional <> '') THEN 20 ELSE 0 END) +
           (CASE WHEN ce.custom_price IS NOT NULL AND ce.custom_price > 0 THEN 15 ELSE 0 END) +
           (CASE WHEN EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id) THEN 20 ELSE 0 END) +
           (CASE WHEN p.ai_category_suggestion IS NOT NULL AND p.ai_category_suggestion <> '' THEN 15 ELSE 0 END) +
           (CASE WHEN p.seo_tags IS NOT NULL AND JSON_VALID(p.seo_tags) AND JSON_LENGTH(p.seo_tags) > 0 THEN 15 ELSE 0 END)
           AS score
         FROM catalog_entries ce
         JOIN products p ON ce.product_id = p.id
         WHERE ce.store_id = ?
       ) AS scored`,
      [req.user.store_id]
    );

    res.json({
      total: Number(r.total) || 0,
      average: Number(r.average) || 0,
      complete: Number(r.complete) || 0,
      good: Number(r.good) || 0,
      needsWork: Number(r.needsWork) || 0,
      poor: Number(r.poor) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Low stock alerts — only for catalog entries the user actually intends to sell
router.get('/low-stock', auth, async (req, res) => {
  try {
    const [entries] = await db.query(
      `SELECT ce.id, ce.stock_quantity, ce.low_stock_threshold, ce.custom_name, p.name, p.barcode
       FROM catalog_entries ce
       JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ?
         AND ce.status IN ('Published', 'Exported')
         AND ce.stock_quantity IS NOT NULL
         AND ce.low_stock_threshold IS NOT NULL
         AND ce.stock_quantity <= ce.low_stock_threshold
       ORDER BY ce.stock_quantity ASC
       LIMIT 50`,
      [req.user.store_id]
    );
    res.json({ items: entries.map(e => ({ id: e.id, name: e.custom_name || e.name, barcode: e.barcode, stock: e.stock_quantity, threshold: e.low_stock_threshold })) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
