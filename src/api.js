const API_URL = 'http://localhost:3000/api';

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
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const handleResponse = async (res) => {
  if (res.status === 401 && onUnauthorized) {
    setToken(null);
    onUnauthorized();
    throw new Error('Session expired. Please sign in again.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

// ── AUTH ──
export const signUp = async (name, email, password, role, store_name) => {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, email, password, role, store_name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setToken(data.token);
  return data;
};

export const signIn = async (email, password) => {
  const res = await fetch(`${API_URL}/auth/signin`, {
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
  const res = await fetch(`${API_URL}/auth/me`, { headers: headers() });
  if (!res.ok) { setToken(null); return null; }
  const data = await res.json();
  return data.user;
};

// ── PRODUCTS ──
export const searchProduct = async (barcode) => {
  const res = await fetch(`${API_URL}/products/search/${barcode}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const saveProduct = async (productData) => {
  const res = await fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(productData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const resolveConflict = async (conflictId, chosenValue) => {
  const res = await fetch(`${API_URL}/products/conflicts/${conflictId}/resolve`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ chosen_value: chosenValue }),
  });
  return res.json();
};

export const refreshProduct = async (barcode) => {
  const res = await fetch(`${API_URL}/products/refresh/${barcode}`, {
    method: 'POST',
    headers: headers(),
  });
  return res.json();
};

// ── CATALOG ──
export const saveForLater = async (productData) => {
  const res = await fetch(`${API_URL}/products/save-for-later`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(productData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getProductById = async (id) => {
  const res = await fetch(`${API_URL}/products/${id}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getCatalog = async () => {
  const res = await fetch(`${API_URL}/products/catalog`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.entries;
};

export const saveToCatalog = async (entry) => {
  const res = await fetch(`${API_URL}/products/catalog`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(entry),
  });
  return res.json();
};

export const updateCatalogStatus = async (id, status) => {
  const res = await fetch(`${API_URL}/products/catalog/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ status }),
  });
  return res.json();
};

// ── ANALYTICS ──
export const getStats = async () => {
  const res = await fetch(`${API_URL}/analytics/stats`, { headers: headers() });
  return res.json();
};

export const getSourcePerformance = async () => {
  const res = await fetch(`${API_URL}/analytics/sources`, { headers: headers() });
  return res.json();
};

export const getSearchHistory = async () => {
  const res = await fetch(`${API_URL}/analytics/searches`, { headers: headers() });
  return res.json();
};

// ── AUTH SETTINGS ──
export const changePassword = async (currentPassword, newPassword) => {
  const res = await fetch(`${API_URL}/auth/change-password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const updateProfile = async (profileData) => {
  const res = await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(profileData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getSettings = async () => {
  const res = await fetch(`${API_URL}/auth/settings`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const updateSettings = async (settings) => {
  const res = await fetch(`${API_URL}/auth/settings`, {
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
  const res = await fetch(`${API_URL}/brand-voices`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.voices;
};

export const createBrandVoice = async (voice) => {
  const res = await fetch(`${API_URL}/brand-voices`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(voice),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.voice;
};

export const updateBrandVoice = async (id, voice) => {
  const res = await fetch(`${API_URL}/brand-voices/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(voice),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.voice;
};

export const deleteBrandVoice = async (id) => {
  const res = await fetch(`${API_URL}/brand-voices/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

// ── AI ──
export const generateAIContent = async (productData) => {
  const res = await fetch(`${API_URL}/ai/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(productData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const identifyProduct = async (imageBase64) => {
  const res = await fetch(`${API_URL}/ai/identify`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ image: imageBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const searchProductImages = async (query) => {
  const res = await fetch(`${API_URL}/ai/search-images`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.images;
};

export const exportProduct = async (format, platform, barcode, productData) => {
  const res = await fetch(`${API_URL}/export`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ format, platform, barcode, productData }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const getExportHistory = async () => {
  const res = await fetch(`${API_URL}/export/history`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.exports;
};

export const downloadExport = async (exportId) => {
  const res = await fetch(`${API_URL}/export/history/${exportId}/download`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const googleSignIn = async (credential) => {
  const res = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setToken(data.token);
  return data;
};

// ── HEALTH ──
export const healthCheck = async () => {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
};
