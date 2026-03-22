-- CatalogAI Database Schema

CREATE DATABASE IF NOT EXISTS catalogai;
USE catalogai;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Admin', 'Editor', 'Viewer') DEFAULT 'Editor',
  store_name VARCHAR(255) DEFAULT 'My Store',
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Product categories
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  parent_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Products (cached — one row per barcode)
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barcode VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NULL,
  brand VARCHAR(255) NULL,
  description TEXT NULL,
  category_id INT NULL,
  ai_description_professional TEXT NULL,
  ai_description_friendly TEXT NULL,
  ai_description_luxury TEXT NULL,
  ai_category_suggestion VARCHAR(255) NULL,
  ai_attributes JSON NULL,
  seo_tags JSON NULL,
  search_count INT DEFAULT 1,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cache_expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Product sources (one row per source per product — for conflict detection)
CREATE TABLE IF NOT EXISTS product_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  source_name VARCHAR(100) NOT NULL,
  source_url VARCHAR(500) NULL,
  price DECIMAL(10,2) NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  weight VARCHAR(50) NULL,
  color VARCHAR(100) NULL,
  description TEXT NULL,
  specs JSON NULL,
  trust_score INT DEFAULT 0,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_product_source (product_id, source_name)
);

-- Product images
CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  source_name VARCHAR(100) NULL,
  image_url VARCHAR(500) NOT NULL,
  is_selected BOOLEAN DEFAULT FALSE,
  quality_score INT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Conflicts (auto-detected when sources disagree)
CREATE TABLE IF NOT EXISTS conflicts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  source_values JSON NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  chosen_value TEXT NULL,
  resolved_by INT NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Catalog entries (user's saved/exported products)
CREATE TABLE IF NOT EXISTS catalog_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  status ENUM('Draft', 'Review', 'Published', 'Exported') DEFAULT 'Draft',
  custom_name VARCHAR(255) NULL,
  custom_description TEXT NULL,
  custom_price DECIMAL(10,2) NULL,
  selected_images JSON NULL,
  brand_voice VARCHAR(50) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Export history
CREATE TABLE IF NOT EXISTS exports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  format VARCHAR(10) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  product_name VARCHAR(255) NULL,
  barcode VARCHAR(50) NULL,
  filename VARCHAR(255) NULL,
  file_content LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Search history (tracks lookups for analytics)
CREATE TABLE IF NOT EXISTS search_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  barcode VARCHAR(50) NULL,
  search_type ENUM('barcode', 'image', 'text') NOT NULL,
  cache_hit BOOLEAN DEFAULT FALSE,
  response_time_ms INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User settings (one row per user)
CREATE TABLE IF NOT EXISTS user_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  currency VARCHAR(10) DEFAULT 'USD',
  export_format ENUM('CSV', 'JSON', 'XML') DEFAULT 'CSV',
  default_platform ENUM('Shopify', 'WooCommerce', 'Magento', 'BigCommerce') DEFAULT 'Shopify',
  notif_export BOOLEAN DEFAULT TRUE,
  notif_weekly BOOLEAN DEFAULT TRUE,
  notif_new_source BOOLEAN DEFAULT FALSE,
  notif_price_conflict BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Brand voice profiles
CREATE TABLE IF NOT EXISTS brand_voices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  tone VARCHAR(50) NULL,
  description TEXT NULL,
  example_text TEXT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX idx_catalog_user ON catalog_entries(user_id);
CREATE INDEX idx_catalog_product ON catalog_entries(product_id);
CREATE INDEX idx_catalog_status ON catalog_entries(user_id, status);
CREATE INDEX idx_search_user ON search_history(user_id);
CREATE INDEX idx_search_barcode ON search_history(barcode);
CREATE INDEX idx_sources_product ON product_sources(product_id);
CREATE INDEX idx_images_product ON product_images(product_id);
CREATE INDEX idx_conflicts_product ON conflicts(product_id);
CREATE INDEX idx_exports_user ON exports(user_id);
CREATE INDEX idx_brand_voices_user ON brand_voices(user_id);
CREATE INDEX idx_password_resets_token ON password_resets(token);
CREATE INDEX idx_products_cache ON products(cache_expires_at);
