# CatalogAI — Project Scope

## Project Overview
CatalogAI is an AI-powered product data aggregation and catalog intelligence system for e-commerce merchants. It automates the process of researching, enriching, and exporting product listings across multiple sales platforms by scanning barcodes or uploading product images, querying multiple data sources, and generating AI-optimized catalog content in multiple languages.

## Problem Statement
E-commerce merchants spend significant time manually researching product information across multiple sources, writing product descriptions, resolving conflicting data, and formatting listings for different platforms. This process is repetitive, time-consuming, error-prone, and does not scale.

## Solution
CatalogAI provides a single multi-tenant platform where merchants can:
- Scan a product barcode or upload an image to instantly aggregate data from multiple sources
- Automatically detect and resolve data conflicts across sources (price, weight, etc.)
- Generate AI-powered product descriptions in 8 languages with custom brand voices
- Enrich catalogs with AI category suggestions, SEO tags, and quality scoring
- Export catalog-ready listings to major e-commerce platforms
- Monitor prices, track team activity, and manage multi-user stores with invitations

## Tech Stack
- **Frontend:** React 19, Vite, split-file architecture (pages + components), three.js for shader background
- **Backend:** Node.js, Express
- **Database:** MySQL via XAMPP (18 tables)
- **Authentication:** JWT in httpOnly cookies, bcrypt, Google OAuth
- **Email:** Nodemailer (Gmail SMTP) for password reset and team invitations
- **Data APIs:** Open Food Facts, UPC Database, Serper.dev (Google Images)
- **AI Services:** Google Gemini 2.5 Flash (descriptions, SEO, category, image recognition, attribute extraction, translations)
- **E-commerce APIs:** Shopify Admin API, Google Merchant Center

---

## Achieved

### Frontend
- Responsive UI with dark (#09090B) and light theme support, CSS custom properties
- Animated sign in / sign up / forgot password / reset / invite acceptance page with WebGL aurora shader background (three.js) and glassmorphism cards
- Custom logo: spinning conic-gradient ring + gem SVG icon + gradient "AI" text — consistent across auth, sidebar, empty states, and search hero
- Collapsible sidebar (230px / 68px) with grouped nav, gradient active accent bar, user avatar, store name, theme toggle
- Role-based access control (Admin, Editor, Viewer) across all pages with UI gating and backend enforcement
- Dashboard: welcome header, compact inline stats bar with gradient text, catalog table with sticky header, saved views, filters, tag management, column customization
- 3-step catalog workflow with gradient pill step indicator: Search → Review → Export
- Search page: new catalog hero with gradient logo and live data source chips
- Review page: split-panel editor, tabbed interface (Overview / Sources / Images / SEO), AI description variants with brand voice selector, multi-language selector, conflict resolution UI, editable product fields, SEO meta preview
- Image Library modal: full-screen picker with filter chips (Front/Back/Side/Top/Label/Lifestyle/Close-up/Packaging/Multi-Pack), search caching, debounced filters, quality badges (HD/MD/LO), resolution + source display, multi-select with gradient ring, paste custom URL, Pinterest-style grid
- Export page: gradient format selector (CSV/JSON/XML), platform selector (Shopify/WooCommerce/Magento/BigCommerce/Google Shopping), live preview, export history with re-download, batch export from dashboard
- Analytics: gradient stats, catalog completeness donut, data source performance bars with gradient fills, recent searches, activity feed, price alerts card
- Settings: 6 sections (Profile, Security, Store Preferences, Integrations, Notifications, Danger Zone) plus Team Management for admins
- Brand Voice Manager: card grid with color-coded borders, compact editor, tone selector, keyword management, live AI preview
- Toast notifications (success/error/warning/info), crash recovery error boundary, loading skeletons, keyboard shortcuts (Ctrl+1-5, Ctrl+N, ?, Esc)
- Mobile responsive layout with collapsible sidebar

### Backend
- Express REST API with structured routes (auth, products, analytics, brand voices, export, AI, catalog, team)
- JWT authentication with httpOnly cookies (secure, sameSite:lax, 30d expiry), Google OAuth with real Client ID
- Rate limiting middleware (40 req/min auth/AI, 30 req/min products/export)
- CORS restricted to app origin, input sanitization, XSS prevention, CSV formula injection protection
- Helmet security headers middleware (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.)
- Image upload validation: MIME whitelist (JPEG/PNG/WEBP/GIF) + 10 MB size cap on AI identify/extract endpoints
- Role enforcement middleware on all write routes
- Barcode API integration with parallel queries to Open Food Facts + UPC Database, 30-day cache, auto-cleanup
- Conflict detection across sources, persisted resolution
- Gemini 2.5 Flash AI integration with retry/fallback across multiple models on 503 overload
  - Product descriptions (Professional, Friendly, Luxury) in 8 languages
  - Category suggestions, SEO tags, meta title/description
  - Image recognition and identification
  - Data quality suggestions
  - Translation endpoint with name and spec translations
- Image discovery via Serper.dev (product images, label shots, lifestyle, etc.)
- Bulk import: CSV parsing with column mapping, batch inserts, duplicate handling, up to 500 rows
- Export engine with price sanitization, length clamping, surfaced error reporting
  - Shopify multi-image CSV, WooCommerce XML, Magento, BigCommerce, Google Shopping feed
  - Shopify Live Sync via Admin API
  - Catalog entry auto-creation on export
- Price monitoring: price_history table populated on every search, alerts for changes
- Activity log with helper function used across all mutating routes
- Password reset flow with Nodemailer, 1hr token expiry, dark-themed HTML email
- Team invitation system with crypto token, 7-day expiry, styled email, acceptance flow
- Auto-migrate on server startup for new teammates

### Database
MySQL relational database with 18 normalized tables:
- `users` — account management with bcrypt-hashed passwords
- `stores` — multi-tenant store container
- `products` — cached product data with configurable expiry
- `product_sources` — per-source data for conflict comparison
- `product_images` — product photo storage with quality scoring
- `conflicts` — tracked data discrepancies with resolution workflow
- `catalog_entries` — store-scoped saved and curated products
- `categories` — hierarchical product categorization
- `exports` — export history and file tracking
- `search_history` — search analytics with cache hit tracking
- `brand_voices` — custom AI voice profiles (store-scoped)
- `user_settings` — per-user personal preferences
- `password_resets` — password reset tokens
- `invitations` — team invitation tokens
- `tags` — store-scoped color-coded tags
- `catalog_entry_tags` — tag assignment junction
- `saved_views` — saved filter combinations per store
- `activity_log` — audit trail of user actions
- `price_history` — historical prices for alerts

12 performance indexes, cascade deletes, store_id scoping throughout.

### Architecture
- Multi-tenant: every public signup creates a new store + Admin user; teams collaborate via invitations
- All shared data (catalog, exports, search history, brand voices, tags, saved views, activity) scoped by store_id
- Personal preferences (theme, language) scoped by user_id
- Viewers can browse but not write; Editors can edit and export; Admins manage settings and team

### Infrastructure
- GitHub private repository with 4 team members (chefxx1 lead + 3 collaborators)
- README with setup instructions
- Environment-based configuration (.env) with optional API keys
- Auto-migrate on server startup
- XAMPP for local MySQL + phpMyAdmin

### Design System
- Tri-color gradient identity (blue → purple → green) applied to logo, primary buttons, active nav, step indicator, stats text, card accents, source performance bars, review tabs, export selectors, user avatars
- Glassmorphism for modals, confirm dialogs, auth cards, and Image Library picker
- WebGL aurora shader background on auth page (three.js)
- Unified gradient spinner component
- Toast notification system with auto-dismiss

---

## Not Yet Tested

- **Team invite system** — full end-to-end (send invite email → user clicks link → account joins store)
- **Shopify Live Sync** — needs a real Shopify dev store + access token
- **Price monitoring alerts** — needs real price changes over time
- **Google Shopping export** — needs validation against Google Merchant Center

## Known Security Gaps (planned for Phase 21)

- No email verification on signup — accounts can be created with unproven email ownership
- No account lockout after repeated failed logins
- No server-side password strength enforcement (frontend check only)
- User enumeration possible via distinct error messages on signup/signin
- HTTPS not enforced (development only; required before production deployment)
- No CSRF tokens (currently relying on `sameSite: lax` cookies)
- No 2FA
- No JWT revocation mechanism (tokens valid until 30-day expiry)

## Future Ideas

- End-to-end automated testing suite
- Mobile app or PWA with offline barcode scanning
- Competitor price tracking and suggestions
- Bulk AI enrichment (one-click enrich all missing fields)
- Side-by-side product comparison view
- Customizable draggable dashboard widgets
- Public product feed URL generator
- Webhook notifications on key events
- Image pipeline using Gemini Nano Banana for AI-generated angles and lifestyle shots (requires billing)

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
| Bulk import CSV | Yes | Yes | No |
| Change settings | Yes | No | No |
| Delete products/data | Yes | No | No |
| Manage API keys | Yes | No | No |
| Invite team members | Yes | No | No |
| Change team member roles | Yes | No | No |
| Delete account (cascades entire store) | Yes | No | No |
