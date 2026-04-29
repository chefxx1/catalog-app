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
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=catalogai
DB_PORT=3306

JWT_SECRET=<generate-a-random-32+-char-string>   # e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
JWT_EXPIRES_IN=30d

PORT=3000
```

**Optional API keys** (features work without these but are limited):
```
GEMINI_API_KEY=your_key_here        # AI descriptions, image identification
SERPER_API_KEY=your_key_here        # Product image search
GOOGLE_CLIENT_ID=your_key_here      # Google OAuth sign-in
EMAIL_USER=your_email@gmail.com     # Password reset emails
EMAIL_PASS=your_app_password        # Gmail app password
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
├── src/                        # Frontend
│   ├── App.jsx                 # All components, pages, styles
│   ├── api.js                  # API helpers (40+ functions)
│   └── main.jsx                # React entry point
│
├── server/                     # Backend
│   ├── index.js                # Express server + auto-migrate
│   ├── db.js                   # MySQL connection pool
│   ├── .env                    # Credentials (not in git)
│   ├── helpers/
│   │   └── activity.js         # Activity logging helper
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication
│   │   ├── requireRole.js      # Role-based access control
│   │   ├── rateLimit.js        # Rate limiting
│   │   └── validate.js         # Input validation + XSS sanitize
│   ├── routes/
│   │   ├── auth.js             # Auth, profile, team, invites
│   │   ├── products.js         # Search, catalog, bulk import
│   │   ├── analytics.js        # Stats, source performance
│   │   ├── brandVoices.js      # Brand voice CRUD
│   │   ├── ai.js               # AI descriptions, translation, image ID
│   │   ├── export.js           # Export, Shopify sync, Google feed, price monitoring
│   │   └── catalog.js          # Tags, saved views, activity feed
│   └── database/
│       └── schema.sql          # MySQL table definitions
│
└── docs/
    └── PROJECT_SCOPE.md        # Full project scope
```

## Team
- chefxx1 — Project Lead
- plgammer331 — Developer
- Afif-Tamim — Developer
- aaisraa99ww-debug — Developer
