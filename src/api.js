const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;

// Token management
let token = localStorage.getItem('catalogai_token');

export const setToken = (t) => {
  token = t;
  if (t) localStorage.setItem('catalogai_token', t);
  else localStorage.removeItem('catalogai_token');
};

export const getToken = () => token;

// 401 handler — auto-logout on expired JWT
let onUnauthorized = null;
export const setOnUnauthorized = (handler) => { onUnauthorized = handler; };

const headers = () => ({
  'Content-Type': 'application/json',
});

// Wrap fetch to always include credentials (sends httpOnly cookie) + 30s timeout
const apiFetch = (url, opts = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  return fetch(url, { ...opts, credentials: 'include', signal: controller.signal })
    .then(res => { clearTimeout(timeout); return res; })
    .catch(err => { clearTimeout(timeout); if (err.name === 'AbortError') throw new Error('Request timed out'); throw err; });
};

const handleResponse = async (res) => {
  if (res.status === 401 && onUnauthorized) {
    setToken(null);
    onUnauthorized();
    throw new Error('Session expired. Please sign in again.');
  }
  if (res.status === 403) {
    throw new Error('You do not have permission to perform this action');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

// ── AUTH ──
export const signUp = async (name, email, password, store_name) => {
  const res = await apiFetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, email, password, store_name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setToken(data.token);
  return data;
};

export const signIn = async (email, password) => {
  const res = await apiFetch(`${API_URL}/auth/signin`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setToken(data.token);
  return data;
};

export const getMe = async () => {
  if (!token) return null;
  const res = await apiFetch(`${API_URL}/auth/me`, { headers: headers() });
  if (!res.ok) { setToken(null); return null; }
  const data = await res.json();
  return data.user;
};

export const forgotPassword = async (email) => {
  const res = await apiFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const resetPassword = async (token, password) => {
  const res = await apiFetch(`${API_URL}/auth/reset-password`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// ── PRODUCTS ──
export const searchProduct = async (barcode) => {
  const res = await apiFetch(`${API_URL}/products/search/${barcode}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const saveProduct = async (productData) => {
  const res = await apiFetch(`${API_URL}/products`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(productData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const resolveConflict = async (conflictId, chosenValue) => {
  const res = await apiFetch(`${API_URL}/products/conflicts/${conflictId}/resolve`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ chosen_value: chosenValue }),
  });
  return handleResponse(res);
};

export const refreshProduct = async (barcode) => {
  const res = await apiFetch(`${API_URL}/products/refresh/${barcode}`, {
    method: 'POST',
    headers: headers(),
  });
  return handleResponse(res);
};

// ── CATALOG ──
export const saveForLater = async (productData) => {
  const res = await apiFetch(`${API_URL}/products/save-for-later`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(productData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getProductById = async (id) => {
  const res = await apiFetch(`${API_URL}/products/${id}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getCatalog = async () => {
  const res = await apiFetch(`${API_URL}/products/catalog`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.entries;
};

export const saveToCatalog = async (entry) => {
  const res = await apiFetch(`${API_URL}/products/catalog`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(entry),
  });
  return handleResponse(res);
};

export const updateCatalogEntry = async (id, fields) => {
  const res = await apiFetch(`${API_URL}/products/catalog/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(fields),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
};

export const updateCatalogStatus = async (id, status) => {
  return updateCatalogEntry(id, { status });
};

export const getVariants = async (entryId) => {
  const res = await apiFetch(`${API_URL}/products/catalog/${entryId}/variants`, { headers: headers() });
  return handleResponse(res);
};

export const createVariant = async (entryId, variant) => {
  const res = await apiFetch(`${API_URL}/products/catalog/${entryId}/variants`, {
    method: 'POST', headers: headers(), body: JSON.stringify(variant),
  });
  return handleResponse(res);
};

export const updateVariant = async (variantId, fields) => {
  const res = await apiFetch(`${API_URL}/products/variants/${variantId}`, {
    method: 'PATCH', headers: headers(), body: JSON.stringify(fields),
  });
  return handleResponse(res);
};

export const deleteVariant = async (variantId) => {
  const res = await apiFetch(`${API_URL}/products/variants/${variantId}`, {
    method: 'DELETE', headers: headers(),
  });
  return handleResponse(res);
};

export const deleteCatalogEntry = async (id) => {
  const res = await apiFetch(`${API_URL}/products/catalog/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Delete failed');
  return data;
};

export const deleteAllData = async () => {
  const res = await apiFetch(`${API_URL}/auth/data`, {
    method: 'DELETE',
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete data');
  return data;
};

export const deleteAccount = async () => {
  const res = await apiFetch(`${API_URL}/auth/account`, {
    method: 'DELETE',
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete account');
  return data;
};

export const clearSearchHistory = async () => {
  const res = await apiFetch(`${API_URL}/analytics/searches`, {
    method: 'DELETE',
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to clear history');
  return data;
};

// ── ANALYTICS ──
export const getStats = async () => {
  const res = await apiFetch(`${API_URL}/analytics/stats`, { headers: headers() });
  return handleResponse(res);
};

export const getSourcePerformance = async () => {
  const res = await apiFetch(`${API_URL}/analytics/sources`, { headers: headers() });
  return handleResponse(res);
};

export const getCompleteness = async () => {
  const res = await apiFetch(`${API_URL}/analytics/completeness`, { headers: headers() });
  return handleResponse(res);
};

export const getLowStock = async () => {
  const res = await apiFetch(`${API_URL}/analytics/low-stock`, { headers: headers() });
  return handleResponse(res);
};

export const getTrending = async (country = 'US', category = 'Electronics') => {
  const qs = new URLSearchParams({ country, category }).toString();
  const res = await apiFetch(`${API_URL}/trending?${qs}`, { headers: headers() });
  return handleResponse(res);
};

export const getTrendingCategories = async () => {
  const res = await apiFetch(`${API_URL}/trending/categories`, { headers: headers() });
  return handleResponse(res);
};

export const addTrendingToCatalog = async (item) => {
  const res = await apiFetch(`${API_URL}/trending/add`, {
    method: 'POST', headers: headers(), body: JSON.stringify(item),
  });
  return handleResponse(res);
};

export const getSearchHistory = async () => {
  const res = await apiFetch(`${API_URL}/analytics/searches`, { headers: headers() });
  return handleResponse(res);
};

// ── AUTH SETTINGS ──
export const changePassword = async (currentPassword, newPassword) => {
  const res = await apiFetch(`${API_URL}/auth/change-password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const updateProfile = async (profileData) => {
  const res = await apiFetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(profileData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getSettings = async () => {
  const res = await apiFetch(`${API_URL}/auth/settings`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const updateSettings = async (settings) => {
  const res = await apiFetch(`${API_URL}/auth/settings`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// ── BRAND VOICES ──
export const getBrandVoices = async () => {
  const res = await apiFetch(`${API_URL}/brand-voices`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.voices;
};

export const createBrandVoice = async (voice) => {
  const res = await apiFetch(`${API_URL}/brand-voices`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(voice),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.voice;
};

export const updateBrandVoice = async (id, voice) => {
  const res = await apiFetch(`${API_URL}/brand-voices/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(voice),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.voice;
};

export const deleteBrandVoice = async (id) => {
  const res = await apiFetch(`${API_URL}/brand-voices/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// ── AI ──
export const generateAIContent = async (productData) => {
  const res = await apiFetch(`${API_URL}/ai/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(productData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const recolorImage = async (imageUrl, color, productName) => {
  const res = await apiFetch(`${API_URL}/ai/recolor`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ imageUrl, color, productName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const aiStudio = async (imageUrl, mode, productName) => {
  const res = await apiFetch(`${API_URL}/ai/studio`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ imageUrl, mode, productName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const identifyProduct = async (imageBase64) => {
  const res = await apiFetch(`${API_URL}/ai/identify`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ image: imageBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getQualitySuggestions = async (productId) => {
  const res = await apiFetch(`${API_URL}/ai/quality-suggestions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ productId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.suggestions;
};

export const searchProductImages = async (query) => {
  const res = await apiFetch(`${API_URL}/ai/search-images`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.images;
};

export const exportProduct = async (format, platform, barcode, productData, productId) => {
  const res = await apiFetch(`${API_URL}/export`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ format, platform, barcode, productData, productId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getExportHistory = async () => {
  const res = await apiFetch(`${API_URL}/export/history`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.exports;
};

export const downloadExport = async (exportId) => {
  const res = await apiFetch(`${API_URL}/export/history/${exportId}/download`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const googleSignIn = async (credential) => {
  const res = await apiFetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setToken(data.token);
  return data;
};

// ── TEAM MANAGEMENT ──
export const getTeamUsers = async () => {
  const res = await apiFetch(`${API_URL}/auth/team`, { headers: headers() });
  return handleResponse(res);
};

export const updateUserRole = async (userId, role) => {
  const res = await apiFetch(`${API_URL}/auth/team/${userId}/role`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ role }),
  });
  return handleResponse(res);
};

export const removeTeamUser = async (userId) => {
  const res = await apiFetch(`${API_URL}/auth/team/${userId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return handleResponse(res);
};

// ── INVITATIONS ──
export const sendInvite = async (email, role) => {
  const res = await apiFetch(`${API_URL}/auth/invite`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ email, role }),
  });
  return handleResponse(res);
};

export const getInviteInfo = async (token) => {
  const res = await apiFetch(`${API_URL}/auth/invite/${token}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const acceptInvite = async (token, name, password) => {
  const res = await apiFetch(`${API_URL}/auth/invite/${token}/accept`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setToken(data.token);
  return data;
};

export const getPendingInvites = async () => {
  const res = await apiFetch(`${API_URL}/auth/invites`, { headers: headers() });
  return handleResponse(res);
};

export const revokeInvite = async (inviteId) => {
  const res = await apiFetch(`${API_URL}/auth/invites/${inviteId}`, {
    method: 'DELETE', headers: headers(),
  });
  return handleResponse(res);
};

// ── TAGS ──
export const getTags = async () => {
  const res = await apiFetch(`${API_URL}/catalog/tags`, { headers: headers() });
  return handleResponse(res);
};
export const createTag = async (name, color) => {
  const res = await apiFetch(`${API_URL}/catalog/tags`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, color }) });
  return handleResponse(res);
};
export const updateTag = async (id, data) => {
  const res = await apiFetch(`${API_URL}/catalog/tags/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) });
  return handleResponse(res);
};
export const deleteTag = async (id) => {
  const res = await apiFetch(`${API_URL}/catalog/tags/${id}`, { method: 'DELETE', headers: headers() });
  return handleResponse(res);
};
export const setEntryTags = async (entryId, tagIds) => {
  const res = await apiFetch(`${API_URL}/catalog/entries/${entryId}/tags`, { method: 'POST', headers: headers(), body: JSON.stringify({ tagIds }) });
  return handleResponse(res);
};
export const getEntryTags = async (entryId) => {
  const res = await apiFetch(`${API_URL}/catalog/entries/${entryId}/tags`, { headers: headers() });
  return handleResponse(res);
};

// ── SAVED VIEWS ──
export const getSavedViews = async () => {
  const res = await apiFetch(`${API_URL}/catalog/views`, { headers: headers() });
  return handleResponse(res);
};
export const createSavedView = async (name, filters) => {
  const res = await apiFetch(`${API_URL}/catalog/views`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, filters }) });
  return handleResponse(res);
};
export const deleteSavedView = async (id) => {
  const res = await apiFetch(`${API_URL}/catalog/views/${id}`, { method: 'DELETE', headers: headers() });
  return handleResponse(res);
};

// ── AI ENHANCEMENTS ──
export const translateDescription = async (name, brand, description, language) => {
  const res = await apiFetch(`${API_URL}/ai/translate`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, brand, description, language }) });
  return handleResponse(res);
};
export const optimizeTitle = async (name, brand, category, description) => {
  const res = await apiFetch(`${API_URL}/ai/optimize-title`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, brand, category, description }) });
  return handleResponse(res);
};
export const extractAttributes = async (image) => {
  const res = await apiFetch(`${API_URL}/ai/extract-attributes`, { method: 'POST', headers: headers(), body: JSON.stringify({ image }) });
  return handleResponse(res);
};
export const generateAltText = async (images, productName, brand) => {
  const res = await apiFetch(`${API_URL}/ai/alt-text`, { method: 'POST', headers: headers(), body: JSON.stringify({ images, productName, brand }) });
  return handleResponse(res);
};

// ── ACTIVITY ──
export const getActivity = async (limit = 30, entityType, entityId) => {
  let url = `${API_URL}/catalog/activity?limit=${limit}`;
  if (entityType) url += `&entity_type=${entityType}`;
  if (entityId) url += `&entity_id=${entityId}`;
  const res = await apiFetch(url, { headers: headers() });
  return handleResponse(res);
};

// ── BULK IMPORT ──
export const bulkImport = async (rows, mapping) => {
  const res = await apiFetch(`${API_URL}/products/bulk-import`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ rows, mapping }),
  });
  return handleResponse(res);
};

// ── INTEGRATIONS ──
export const getGoogleMerchantFeed = async () => {
  const res = await apiFetch(`${API_URL}/export/google-merchant-feed`, { headers: headers() });
  return handleResponse(res);
};
export const shopifySync = async (shopifyDomain, clientId, clientSecret, productIds) => {
  const res = await apiFetch(`${API_URL}/export/shopify-sync`, { method: 'POST', headers: headers(), body: JSON.stringify({ shopifyDomain, clientId, clientSecret, productIds }) });
  return handleResponse(res);
};
export const getPriceHistory = async (productId) => {
  const res = await apiFetch(`${API_URL}/export/price-history/${productId}`, { headers: headers() });
  return handleResponse(res);
};
export const getPriceAlerts = async () => {
  const res = await apiFetch(`${API_URL}/export/price-alerts`, { headers: headers() });
  return handleResponse(res);
};

// ── HEALTH ──
export const healthCheck = async () => {
  const res = await apiFetch(`${API_URL}/health`);
  return handleResponse(res);
};

export const logout = async () => {
  try { await apiFetch(`${API_URL}/auth/logout`, { method: 'POST', headers: headers() }); } catch {}
  setToken(null);
};
