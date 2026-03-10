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
8. Click **Go** — this creates all 11 tables

### 3. Create the environment file
Create a file called `.env` inside the `server/` folder:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=catalogai
DB_PORT=3306

JWT_SECRET=<REDACTED>
JWT_EXPIRES_IN=30d

PORT=3000
```

### 4. Run the app
Open **two terminals**:

**Terminal 1 — Frontend:**
```bash
npm run dev
```

**Terminal 2 — Backend:**
```bash
npm run server
```

### 5. Open in browser
Go to http://localhost:5173

**Demo login:** `demo@catalogai.com` / `demo1234`

Or sign up for a new account.

## Project Structure

```
catalog-app/
├── index.html              # Main HTML page
├── package.json            # Dependencies and scripts
├── vite.config.js          # Vite dev server config
│
├── src/                    # Frontend
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # All components, pages, and styles
│   ├── api.js              # API helper + JWT token management
│   └── index.css           # CSS reset
│
├── server/                 # Backend
│   ├── index.js            # Express server entry point
│   ├── db.js               # MySQL connection pool
│   ├── .env                # Database credentials (not in git)
│   ├── middleware/
│   │   └── auth.js         # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js         # Sign in, sign up, profile, settings
│   │   ├── products.js     # Search, cache, conflicts, catalog
│   │   ├── analytics.js    # Stats, source performance, history
│   │   └── brandVoices.js  # Brand voice CRUD with ownership
│   └── database/
│       └── schema.sql      # MySQL table definitions (11 tables)
│
└── docs/
    └── PROJECT_SCOPE.md    # Full project scope document
```

## Team
- chefxx1 — Project Lead
- plgammer331 — Developer
- Afif-Tamim — Developer
