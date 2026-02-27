# CatalogAI — Project Scope

## Project Overview
CatalogAI is an AI-powered product data aggregation and catalog intelligence system for e-commerce merchants. It automates the process of researching, enriching, and exporting product listings across multiple sales platforms by scanning barcodes or uploading product images, querying multiple data sources, and generating AI-optimized catalog content.

## Problem Statement
E-commerce merchants spend significant time manually researching product information across multiple sources (Amazon, Alibaba, Google, etc.), writing product descriptions, resolving conflicting data, and formatting listings for different platforms. This process is repetitive, time-consuming, and prone to human error.

## Solution
CatalogAI provides a single platform where merchants can:
- Scan a product barcode or upload an image to instantly aggregate data from 5+ sources
- Automatically detect and resolve data conflicts across sources (price, weight, color discrepancies)
- Generate AI-powered product descriptions in multiple brand voices
- Export catalog-ready listings to major e-commerce platforms

## Tech Stack
- **Frontend:** React 18, Vite
- **Backend:** Node.js, Express
- **Database:** MySQL
- **Authentication:** JWT tokens, bcrypt password hashing
- **APIs:** Open Food Facts, UPC Database, Amazon Product API, Google Custom Search
- **AI Services:** OpenAI / Claude API for product descriptions and image recognition

---

## Achieved (Completed)

### Frontend
- Full responsive UI with dark/light theme support
- Animated login page with sign in, sign up, and forgot password flows
- Role-based access control (Admin, Editor, Viewer) across all pages
- Dashboard with stats grid, catalog table, and brand voice previews
- 3-step catalog workflow: Search → Review → Export
- Product review page with split-panel editor, tabbed data view (overview, sources, images, SEO), and AI description variants
- Export page with format selection (CSV/JSON/XML) and platform selection (Shopify/WooCommerce/Magento/BigCommerce)
- Analytics page with performance metrics and source trust score visualization
- Settings page with 6 sections: Profile, Change Password, Store Settings, API Configuration, Notification Preferences, Danger Zone
- Brand Voice Manager with card grid view, full editor with tone selector, keyword management, and live AI description preview
- Custom design system: 30+ SVG icons, reusable components (ToggleSwitch, TagInput, ConfirmDialog, InputField, PasswordStrengthBar), CSS animations

### Backend
- Express REST API with structured route architecture
- JWT-based authentication (signup, signin, token verification)
- Product search endpoint with 30-day caching system to reduce API costs
- Automatic conflict detection when sources report different values
- Catalog management endpoints (create, update status, list)
- Analytics endpoints (dashboard stats, source performance, search history)
- Health check endpoint for monitoring

### Database
- MySQL relational database with 10 normalized tables:
  - `users` — account management with bcrypt-hashed passwords
  - `products` — cached product data with configurable expiry
  - `product_sources` — per-source data for conflict comparison
  - `product_images` — product photo storage with quality scoring
  - `conflicts` — tracked data discrepancies with resolution workflow
  - `catalog_entries` — user's saved and curated products
  - `categories` — hierarchical product categorization
  - `exports` — export history and file tracking
  - `search_history` — search analytics with cache hit tracking
  - `brand_voices` — custom AI voice profiles

### Infrastructure
- GitHub private repository with team collaboration
- Version control with structured commit history
- Environment-based configuration (.env) for security

---

## To Be Achieved (Planned)

### Phase 1 — Core Functionality
- **Barcode API Integration:** Connect to Open Food Facts (free) and UPC Database APIs to return real product data from barcode scans
- **Search-to-Database Pipeline:** Wire the frontend search to the backend, implementing the cache-first strategy (check database before calling external APIs)
- **Change Password:** Connect the existing UI to a backend endpoint for real password updates
- **Settings Persistence:** Save profile changes, store settings, API keys, and notification preferences to the database
- **Brand Voice Persistence:** Save created/edited brand voices to the database

### Phase 2 — Dashboard & Analytics
- **Live Dashboard:** Replace mock catalog data with real entries from the database
- **Real Analytics:** Display actual search counts, cache hit rates, average response times, and source performance from the database

### Phase 3 — AI Integration
- **AI Product Descriptions:** Integrate OpenAI or Claude API to generate Professional, Friendly, and Luxury product descriptions based on aggregated product data
- **AI Category Suggestion:** Automatically categorize products using AI analysis
- **SEO Tag Generation:** AI-generated search-optimized tags for product listings

### Phase 4 — Advanced Features
- **Image Recognition:** Upload a product photo and use AI vision to identify the product and retrieve matching data
- **Real Export Engine:** Generate platform-specific import files (Shopify CSV schema, WooCommerce XML, Magento format, BigCommerce format)
- **Google OAuth:** Enable "Continue with Google" sign-in

---

## User Roles & Permissions

| Permission | Admin | Editor | Viewer |
|---|---|---|---|
| Search/scan products | Yes | Yes | Yes |
| View catalog & analytics | Yes | Yes | Yes |
| Edit product descriptions | Yes | Yes | No |
| Save to catalog | Yes | Yes | No |
| Export products | Yes | Yes | No |
| Create/edit brand voices | Yes | Yes | No |
| Change settings | Yes | No | No |
| Delete products/data | Yes | No | No |
| Manage API keys | Yes | No | No |

---

## Team
- Naim (chefxx1) — Project Lead / Full-Stack Development
- plgammer331 — Development
- Afif-Tamim — Development
