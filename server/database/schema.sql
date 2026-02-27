-- CatalogAI Database Schema

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
  source_name ENUM('Amazon', 'Alibaba', 'Open Food Facts', 'UPC Database', 'Google') NOT NULL,
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
  catalog_entry_id INT NOT NULL,
  format ENUM('CSV', 'JSON', 'XML') NOT NULL,
  platform ENUM('Shopify', 'WooCommerce', 'Magento', 'BigCommerce') NOT NULL,
  file_path VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_entry_id) REFERENCES catalog_entries(id) ON DELETE CASCADE
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

-- Brand voice profiles
CREATE TABLE IF NOT EXISTS brand_voices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  tone VARCHAR(50) NULL,
  description TEXT NULL,
  example_text TEXT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
