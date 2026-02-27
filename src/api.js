const API_URL = 'http://localhost:3000/api';

// Token management
let token = localStorage.getItem('catalogai_token');

export const setToken = (t) => {
  token = t;
  if (t) localStorage.setItem('catalogai_token', t);
  else localStorage.removeItem('catalogai_token');
};

export const getToken = () => token;

const headers = () => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

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

// ── HEALTH ──
export const healthCheck = async () => {
  const res = await fetch(`${API_URL}/health`);
  return res.json();
};
