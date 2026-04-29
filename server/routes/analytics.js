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
    const [entries] = await db.query(
      `SELECT ce.custom_name, ce.custom_description, ce.custom_price, ce.selected_images,
              p.name, p.description, p.ai_description_professional, p.ai_category_suggestion, p.seo_tags,
              (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS image_count
       FROM catalog_entries ce
       JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ?`,
      [req.user.store_id]
    );

    let complete = 0, good = 0, needsWork = 0, poor = 0;
    let totalScore = 0;

    for (const e of entries) {
      let score = 0;
      if (e.custom_name || e.name) score += 15;
      if (e.custom_description || e.description || e.ai_description_professional) score += 20;
      if (e.custom_price) score += 15;
      const imgs = e.selected_images ? (typeof e.selected_images === 'string' ? JSON.parse(e.selected_images || '[]') : e.selected_images) : [];
      if (e.image_count > 0 || imgs.length > 0) score += 20;
      if (e.ai_category_suggestion) score += 15;
      const tags = e.seo_tags ? (typeof e.seo_tags === 'string' ? JSON.parse(e.seo_tags || '[]') : e.seo_tags) : [];
      if (tags.length > 0) score += 15;

      totalScore += score;
      if (score === 100) complete++;
      else if (score >= 70) good++;
      else if (score >= 40) needsWork++;
      else poor++;
    }

    res.json({
      total: entries.length,
      average: entries.length > 0 ? Math.round(totalScore / entries.length) : 0,
      complete,
      good,
      needsWork,
      poor,
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
