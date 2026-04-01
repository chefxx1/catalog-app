const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: __dirname + '/.env' });

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const brandVoiceRoutes = require('./routes/brandVoices');
const aiRoutes = require('./routes/ai');
const exportRoutes = require('./routes/export');
const db = require('./db');

const rateLimit = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));

// Rate limiting per route group
app.use('/api/auth', rateLimit({ max: 40, windowMs: 60000, message: 'Too many requests, try again in a minute' }));
app.use('/api/ai', rateLimit({ max: 10, windowMs: 60000, message: 'AI rate limit reached, try again in a minute' }));
app.use('/api/products', rateLimit({ max: 30, windowMs: 60000 }));
app.use('/api/export', rateLimit({ max: 30, windowMs: 60000 }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/brand-voices', brandVoiceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Auto-purge expired product cache every 24 hours
async function purgeExpiredCache() {
  try {
    const [result] = await db.query('DELETE FROM products WHERE cache_expires_at < NOW() AND id NOT IN (SELECT product_id FROM catalog_entries)');
    if (result.affectedRows > 0) console.log(`Cache cleanup: purged ${result.affectedRows} expired products`);
  } catch (err) {
    console.error('Cache cleanup error:', err.message);
  }
}
setInterval(purgeExpiredCache, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`CatalogAI API running on http://localhost:${PORT}`);
  purgeExpiredCache(); // Run once on startup
});
