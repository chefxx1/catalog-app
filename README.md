# CatalogAI

AI-Powered Product Data Intelligence for e-commerce merchants.

## Prerequisites

Install these before starting:

- **Node.js** (LTS) — https://nodejs.org
- **XAMPP** — https://www.apachefriends.org (for MySQL)
- **Git** — https://git-scm.com

## Setup

There are two ways to clone the project:

### Option A — Using Terminal
```bash
git clone https://github.com/chefxx1/catalog-app.git
cd catalog-app
npm install
```

### Option B — Using VS Code
1. Open **VS Code**
2. Press `Ctrl + Shift + P` and type **Git: Clone**
3. Paste: `https://github.com/chefxx1/catalog-app.git`
4. Pick a folder to save it and click **Open**
5. Open the terminal in VS Code (`Ctrl + ~`)
6. Run: `npm install`

### 2. Set up MySQL
1. Open **XAMPP Control Panel**
2. Start **MySQL** and **Apache**
3. Open http://localhost/phpmyadmin
4. Click **New** on the left sidebar
5. Create a database called `catalogai`
6. Click on `catalogai`, then click the **Import** tab
7. Browse and select `server/database/schema.sql` from the project
8. Click **Go** — this creates all the tables

> **Note:** The server also auto-creates any missing tables on startup, so if you pull new updates you don't need to re-import the schema.

### 3. Create the environment file
Create a file called `.env` inside the `server/` folder:

```
# Database (XAMPP defaults shown)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=catalogai
DB_PORT=3306

# Auth — JWT_SECRET MUST be set, or sign-in will throw
JWT_SECRET=<generate-a-random-32+-char-string>   # e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
JWT_EXPIRES_IN=30d

# Server
PORT=3000
NODE_ENV=development                  # set to "production" to enable secure cookies
CORS_ORIGIN=http://localhost:5173     # frontend dev URL
```

**Optional API keys** (features degrade gracefully without these):
```
# AI
GEMINI_API_KEY=your_key_here          # AI descriptions, image identification, translations
GROQ_API_KEY=your_key_here            # AI chat assistant (CommandPalette / Ctrl+K)
SERPER_API_KEY=your_key_here          # Product image search, trending products

# OAuth
GOOGLE_CLIENT_ID=your_key_here        # Google sign-in button

# Email (password resets + team invitations — uses Gmail SMTP by default)
SMTP_HOST=smtp.gmail.com              # optional, default shown
SMTP_PORT=587                         # optional, default shown
SMTP_USER=your_email@gmail.com        # Gmail address
SMTP_PASS=your_app_password           # Gmail app password (not your regular password)
SMTP_FROM=your_email@gmail.com        # optional, defaults to SMTP_USER
```

### 4. Run the app
Open **two terminals**:

**Terminal 1 — Backend:**
```bash
npm run server
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

### 5. Open in browser
Go to http://localhost:5173 and sign up for a new account.

## Project Structure

```
catalog-app/
├── src/                              # Frontend (React 19 + Vite)
│   ├── main.jsx                      # React entry point
│   ├── App.jsx                       # Root shell: auth, view routing, keyboard shortcuts
│   ├── api.js                        # All HTTP wrappers (auth, catalog, AI, chat, export…)
│   ├── index.css                     # CSS reset
│   ├── pages/                        # One file per top-level view
│   │   ├── AuthPage.jsx              # signin/signup/forgot/reset/invite-accept
│   │   ├── Dashboard.jsx             # Catalog table, filters, tags, batch export
│   │   ├── SearchStep.jsx            # Barcode + image identification (step 1)
│   │   ├── ReviewStep.jsx            # AI descriptions, conflicts, image library (step 2)
│   │   ├── ExportStep.jsx            # Format/platform selector + history (step 3)
│   │   ├── BulkImportView.jsx        # CSV upload → map → preview → import
│   │   ├── Settings.jsx              # Profile, security, preferences, integrations
│   │   ├── TeamManagement.jsx        # Invite / role-change / remove (embedded in Settings)
│   │   ├── Analytics.jsx             # Stats, completeness, source performance
│   │   ├── BrandVoices.jsx           # Tone/audience/keywords CRUD
│   │   └── Trending.jsx              # Trending products from Serper.dev
│   ├── components/                   # Reusable UI
│   │   ├── CommandPalette.jsx        # Ctrl+K AI chat dock (streaming)
│   │   ├── GlobalStyles.jsx          # All CSS vars, animations, utility classes
│   │   ├── shared.jsx                # Icon, Toast helpers, ConfirmDialog, InputField…
│   │   ├── CameraScanner.jsx         # html5-qrcode camera modal
│   │   ├── TranslateModal.jsx        # 10-language product translation
│   │   ├── VariantManager.jsx        # Product variants CRUD
│   │   ├── VisualPreview.jsx         # Platform-mockup cards for ExportStep
│   │   ├── CompletenessRing.jsx      # SVG ring used in completeness modal
│   │   ├── ShaderBackground.jsx      # WebGL aurora on auth page
│   │   ├── SparklesBg.jsx            # tsparticles drift background
│   │   ├── Toast.jsx                 # Imperative toast.success/error/warning/info
│   │   ├── BrandOrb.jsx              # Animated gradient logo orb
│   │   ├── ErrorBoundary.jsx         # Crash recovery
│   │   └── ThemeToggle.jsx           # Sun/moon toggle
│   ├── constants/
│   │   └── catalog.js                # Statuses, completeness thresholds, source colors
│   └── utils/
│       └── pdfExport.js              # jsPDF product + catalog PDF generators
│
├── server/                           # Backend (Express 5 + mysql2)
│   ├── index.js                      # App bootstrap + auto-migrate + global error handler
│   ├── db.js                         # MySQL connection pool
│   ├── .env                          # Credentials (not in git)
│   ├── helpers/
│   │   └── activity.js               # Activity log helper
│   ├── middleware/
│   │   ├── auth.js                   # JWT auth (cookie + Bearer fallback)
│   │   ├── requireRole.js            # Role-based access control
│   │   ├── rateLimit.js              # Per-token sliding-window rate limiter
│   │   └── validate.js               # sanitize / isValidEmail / maxLen
│   ├── routes/
│   │   ├── auth.js                   # Signup, signin, OAuth, password reset, team, invites
│   │   ├── products.js               # Barcode search, catalog CRUD, variants, translations, bulk import
│   │   ├── catalog.js                # Tags, saved views, activity feed
│   │   ├── ai.js                     # Gemini wrappers (descriptions, identify, translate, image search)
│   │   ├── chat.js                   # Groq Llama 3.3 chat router (7 intent types, SSE streaming)
│   │   ├── export.js                 # CSV/JSON/XML, Shopify sync, Google Merchant feed
│   │   ├── analytics.js              # Stats, completeness, source performance, low stock
│   │   ├── brandVoices.js            # Store-shared brand voice CRUD
│   │   └── trending.js               # Serper-backed trending products
│   └── database/
│       ├── schema.sql                # MySQL table definitions
│       └── migrate-stores.js         # One-time multi-tenant migration (already run)
│
├── docs/
│   ├── PROJECT_SCOPE.md              # High-level project scope
│   └── PROJECT_OVERVIEW.md           # Full architecture write-up for the report
│
├── index.html                        # Vite entry (loads Google Identity Services SDK)
├── vite.config.js                    # Vite + React plugin
├── eslint.config.js                  # Flat-config ESLint with react-hooks rules
└── package.json                      # Frontend + shared deps (server has its own for helmet)
```

## Team
- chefxx1 — Project Lead
- plgammer331 — Developer
- Afif-Tamim — Developer
- aaisraa99ww-debug — Developer
