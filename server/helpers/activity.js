const db = require('../db');

/**
 * Log an activity event.
 * @param {object} opts
 * @param {number} opts.store_id
 * @param {number} opts.user_id
 * @param {string} opts.action - e.g. 'created', 'updated', 'deleted', 'exported', 'imported'
 * @param {string} [opts.entity_type] - e.g. 'product', 'catalog_entry', 'brand_voice', 'tag', 'export', 'team'
 * @param {number} [opts.entity_id]
 * @param {string} [opts.entity_name] - human-readable name of the entity
 * @param {object} [opts.details] - extra context (e.g. { field: 'price', old: '99', new: '129' })
 */
async function logActivity({ store_id, user_id, action, entity_type, entity_id, entity_name, details }) {
  try {
    await db.query(
      `INSERT INTO activity_log (store_id, user_id, action, entity_type, entity_id, entity_name, details) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [store_id, user_id, action, entity_type || null, entity_id || null, entity_name || null, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    // Activity logging should never break the main flow
    console.error('Activity log error:', err.message);
  }
}

module.exports = logActivity;
