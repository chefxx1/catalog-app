// Strip HTML tags to prevent stored XSS
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

// Validate email format
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Enforce max length, return sanitized or null if too long
function maxLen(str, max, fieldName) {
  if (!str) return null;
  const clean = sanitize(str);
  if (clean.length > max) {
    return { error: `${fieldName} must be under ${max} characters` };
  }
  return clean;
}

module.exports = { sanitize, isValidEmail, maxLen };
