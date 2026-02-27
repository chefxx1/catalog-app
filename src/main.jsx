import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Polyfill window.storage for the app (uses localStorage underneath)
window.storage = {
  get: async (key) => {
    const value = localStorage.getItem(key);
    return value !== null ? { value } : null;
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
  },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
