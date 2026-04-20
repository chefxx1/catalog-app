const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
require('dotenv').config({ path: __dirname + '/.env' });

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const brandVoiceRoutes = require('./routes/brandVoices');
const aiRoutes = require('./routes/ai');
const exportRoutes = require('./routes/export');
const catalogRoutes = require('./routes/catalog');
const trendingRoutes = require('./routes/trending');
const db = require('./db');

const rateLimit = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // off because we inline styles; turn on in prod with a proper policy
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

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
app.use('/api/catalog', catalogRoutes);
app.use('/api/trending', trendingRoutes);

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

// Auto-migrate: ensure all tables exist on startup
async function autoMigrate() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS stores (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS tags (
      id INT AUTO_INCREMENT PRIMARY KEY, store_id INT NOT NULL, name VARCHAR(50) NOT NULL, color VARCHAR(7) DEFAULT '#3B82F6', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE, UNIQUE KEY unique_store_tag (store_id, name)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS catalog_entry_tags (
      catalog_entry_id INT NOT NULL, tag_id INT NOT NULL, PRIMARY KEY (catalog_entry_id, tag_id),
      FOREIGN KEY (catalog_entry_id) REFERENCES catalog_entries(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS saved_views (
      id INT AUTO_INCREMENT PRIMARY KEY, store_id INT NOT NULL, user_id INT NOT NULL, name VARCHAR(100) NOT NULL, filters JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY, store_id INT NOT NULL, user_id INT NOT NULL, action VARCHAR(50) NOT NULL, entity_type VARCHAR(30) NULL, entity_id INT NULL, entity_name VARCHAR(255) NULL, details JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS price_history (
      id INT AUTO_INCREMENT PRIMARY KEY, store_id INT NOT NULL, product_id INT NOT NULL, source_name VARCHAR(100) NOT NULL, price DECIMAL(10,2) NOT NULL, currency VARCHAR(10) DEFAULT 'USD', recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )`);

    // Inventory columns on catalog_entries
    const [invCols] = await db.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_entries' AND COLUMN_NAME IN ('stock_quantity','low_stock_threshold')`);
    const invNames = invCols.map(r => r.COLUMN_NAME);
    if (!invNames.includes('stock_quantity')) {
      await db.query(`ALTER TABLE catalog_entries ADD COLUMN stock_quantity INT NULL DEFAULT NULL`);
    }
    if (!invNames.includes('low_stock_threshold')) {
      await db.query(`ALTER TABLE catalog_entries ADD COLUMN low_stock_threshold INT NULL DEFAULT 5`);
    }

    // Product variants
    await db.query(`CREATE TABLE IF NOT EXISTS product_variants (
      id INT AUTO_INCREMENT PRIMARY KEY, catalog_entry_id INT NOT NULL, variant_name VARCHAR(255) NOT NULL, option_values JSON NULL, sku VARCHAR(100) NULL, price DECIMAL(10,2) NULL, stock_quantity INT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (catalog_entry_id) REFERENCES catalog_entries(id) ON DELETE CASCADE, INDEX idx_variant_catalog (catalog_entry_id)
    )`);

    // Trending cache (global, not store-scoped)
    await db.query(`CREATE TABLE IF NOT EXISTS trending_cache (
      id INT AUTO_INCREMENT PRIMARY KEY, cache_key VARCHAR(191) NOT NULL UNIQUE, data JSON NOT NULL, cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_cache_key (cache_key)
    )`);

    console.log('Auto-migrate: all tables verified');
  } catch (err) {
    console.error('Auto-migrate error:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`CatalogAI API running on http://localhost:${PORT}`);
  autoMigrate();
  purgeExpiredCache();
});
