/**
 * Migration: Add multi-tenant store support
 * Run once: node server/database/migrate-stores.js
 *
 * What it does:
 * 1. Creates `stores` and `invitations` tables
 * 2. Adds `store_id` column to users, catalog_entries, exports, search_history, brand_voices
 * 3. For each existing user, creates a store and backfills store_id
 * 4. Makes store_id NOT NULL + adds indexes
 * 5. Drops the old store_name column from users
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/../.env' });

async function migrate() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  });

  console.log('Connected to database. Starting migration...\n');

  // Step 1: Create stores table
  console.log('1. Creating stores table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL DEFAULT 'My Store',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Step 2: Create invitations table
  console.log('2. Creating invitations table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      inviter_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      role ENUM('Editor', 'Viewer') NOT NULL DEFAULT 'Editor',
      token VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      accepted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Step 3: Add store_id columns (nullable initially)
  console.log('3. Adding store_id columns...');

  const addCol = async (table) => {
    const [cols] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'store_id'`);
    if (cols.length === 0) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN store_id INT NULL`);
      console.log(`   Added store_id to ${table}`);
    } else {
      console.log(`   store_id already exists on ${table}, skipping`);
    }
  };

  await addCol('users');
  await addCol('catalog_entries');
  await addCol('exports');
  await addCol('search_history');
  await addCol('brand_voices');

  // Step 4: Create a store for each existing user and backfill
  console.log('4. Creating stores for existing users...');
  const [users] = await db.query('SELECT id, store_name, role FROM users WHERE store_id IS NULL');
  console.log(`   Found ${users.length} user(s) without a store`);

  for (const user of users) {
    const storeName = user.store_name || 'My Store';
    const [result] = await db.query('INSERT INTO stores (name) VALUES (?)', [storeName]);
    const storeId = result.insertId;
    await db.query('UPDATE users SET store_id = ?, role = ? WHERE id = ?', [storeId, 'Admin', user.id]);
    console.log(`   User #${user.id} -> Store #${storeId} ("${storeName}") as Admin`);
  }

  // Step 5: Backfill store_id on child tables
  console.log('5. Backfilling store_id on child tables...');

  const backfill = async (table) => {
    const [result] = await db.query(
      `UPDATE ${table} t JOIN users u ON t.user_id = u.id SET t.store_id = u.store_id WHERE t.store_id IS NULL`
    );
    console.log(`   ${table}: ${result.affectedRows} rows updated`);
  };

  await backfill('catalog_entries');
  await backfill('exports');
  await backfill('search_history');
  await backfill('brand_voices');

  // Step 6: Make store_id NOT NULL
  console.log('6. Making store_id NOT NULL...');
  await db.query('ALTER TABLE users MODIFY store_id INT NOT NULL');
  await db.query('ALTER TABLE catalog_entries MODIFY store_id INT NOT NULL');
  await db.query('ALTER TABLE exports MODIFY store_id INT NOT NULL');
  await db.query('ALTER TABLE search_history MODIFY store_id INT NOT NULL');
  await db.query('ALTER TABLE brand_voices MODIFY store_id INT NOT NULL');

  // Step 7: Add foreign keys and indexes (skip if they already exist)
  console.log('7. Adding foreign keys and indexes...');

  const addFK = async (table, col, ref) => {
    try {
      await db.query(`ALTER TABLE ${table} ADD FOREIGN KEY (${col}) REFERENCES ${ref}`);
    } catch (e) {
      if (e.code === 'ER_FK_DUP_NAME' || e.errno === 1826 || e.errno === 1022) {
        console.log(`   FK on ${table}.${col} already exists`);
      } else throw e;
    }
  };

  await addFK('users', 'store_id', 'stores(id) ON DELETE CASCADE');
  await addFK('catalog_entries', 'store_id', 'stores(id) ON DELETE CASCADE');
  await addFK('exports', 'store_id', 'stores(id) ON DELETE CASCADE');
  await addFK('search_history', 'store_id', 'stores(id) ON DELETE CASCADE');
  await addFK('brand_voices', 'store_id', 'stores(id) ON DELETE CASCADE');

  const addIdx = async (name, table, col) => {
    try {
      await db.query(`CREATE INDEX ${name} ON ${table}(${col})`);
    } catch (e) {
      if (e.errno === 1061) { // Duplicate key name
        console.log(`   Index ${name} already exists`);
      } else throw e;
    }
  };

  await addIdx('idx_users_store', 'users', 'store_id');
  await addIdx('idx_catalog_store', 'catalog_entries', 'store_id');
  await addIdx('idx_exports_store', 'exports', 'store_id');
  await addIdx('idx_search_store', 'search_history', 'store_id');
  await addIdx('idx_brand_voices_store', 'brand_voices', 'store_id');
  await addIdx('idx_invitations_token', 'invitations', 'token');
  await addIdx('idx_invitations_email', 'invitations', 'email');

  // Step 8: Drop store_name from users (now on stores table)
  console.log('8. Dropping store_name from users...');
  try {
    await db.query('ALTER TABLE users DROP COLUMN store_name');
  } catch (e) {
    if (e.errno === 1091) { // Can't DROP, check column doesn't exist
      console.log('   store_name already dropped');
    } else throw e;
  }

  console.log('\nMigration complete!');
  await db.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
