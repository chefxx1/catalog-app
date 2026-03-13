const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: __dirname + '/.env' });

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const brandVoiceRoutes = require('./routes/brandVoices');
const aiRoutes = require('./routes/ai');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/brand-voices', brandVoiceRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`CatalogAI API running on http://localhost:${PORT}`);
});
