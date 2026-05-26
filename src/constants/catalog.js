// Shared catalog constants — keep this file in sync with the backend.
// Status enum mirrors `catalog_entries.status` ENUM in schema.sql.

export const STATUSES = ['Draft', 'Review', 'Published', 'Exported'];

// Completeness score thresholds (0-100). Used by Dashboard filters, Analytics
// donut, CompletenessRing colors, and the completeness modal.
export const COMPLETENESS = {
  COMPLETE: 100,
  GOOD: 70,
  NEEDS_WORK: 40,
};

// Color for a completeness percentage. Single source of truth — every
// completeness UI element calls this so the colors never drift.
export function completenessColor(pct) {
  const p = Number(pct) || 0;
  if (p >= COMPLETENESS.COMPLETE) return '#10B981'; // green
  if (p >= COMPLETENESS.GOOD) return '#3B82F6';     // blue
  if (p >= COMPLETENESS.NEEDS_WORK) return '#F59E0B'; // amber
  return '#EF4444';                                  // red
}

// Bucket name for a completeness percentage. Mirrors `completenessColor`.
export function completenessBucket(pct) {
  const p = Number(pct) || 0;
  if (p >= COMPLETENESS.COMPLETE) return 'complete';
  if (p >= COMPLETENESS.GOOD) return 'good';
  if (p >= COMPLETENESS.NEEDS_WORK) return 'needs-work';
  return 'poor';
}

// Brand colors for every data source we know about. Used by Review (source
// pills) and Analytics (source performance bars). Falls back to a neutral blue.
export const SOURCE_COLORS = {
  'Amazon': '#FF9900',
  'Open Food Facts': '#10B981',
  'Walmart': '#0071CE',
  'IKEA': '#0058A3',
  'Target': '#CC0000',
  'Best Buy': '#0046BE',
  'Wayfair': '#7B189F',
  'eBay': '#E53238',
  'Etsy': '#F1641E',
  'Home Depot': '#F96302',
  'UPC Database': '#6366F1',
  'Alibaba': '#FF6A00',
  'Google': '#4285F4',
  'Barcode Spider': '#F97316',
};

export function sourceColor(name) {
  return SOURCE_COLORS[name] || '#3B82F6';
}
