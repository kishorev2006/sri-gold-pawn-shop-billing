# Sri Gold Pawn Shop Billing System

An offline desktop pawn-shop billing and loan management application built with **React 19**, **Vite**, **Electron**, and **SQLite (`better-sqlite3`)**.

---

## 🏗️ Architecture Overview

The system strictly enforces process separation and security isolation:

```
React UI  -->  React Services  -->  Electron IPC (window.api)  -->  Preload Bridge  -->  Electron Main  -->  SQLite (userData)
```

- **React 19 Renderer**: UI components, pages, routes, and styles (`src/`).
- **Context Isolation & Security**: `contextIsolation: true`, `nodeIntegration: false`. No Node.js or `better-sqlite3` exposed directly to React.
- **IPC Layer**: Bridge (`electron/preload.js`) exposes `window.api.database.getStatus()`.
- **Database Storage**: Local SQLite database located in Electron's `app.getPath('userData')` directory (`sri_gold_pawn_shop.sqlite`).

---

## 🛠️ Prerequisites & Setup

### Requirements
- **Node.js**: v18+ or v20+ / v22+
- **npm**: v9+ or v10+

### Installation

1. Clone or open the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

3. Rebuild native modules (`better-sqlite3`) for Electron:
   ```bash
   npm run rebuild
   ```

---

## 🚀 Running the Application

### Development Mode (React + Electron)

Run both Vite dev server and Electron process together:

```bash
npm run dev
```

- React Dev Server starts at `http://localhost:5173`.
- Electron window opens automatically and connects to dev server.

### Rebuilding Native Module

If Electron version or Node ABI changes:

```bash
npm run rebuild
```

### Production Build

Build the React app bundle for Electron:

```bash
npm run build
```

---

## 📁 Project Directory Structure

```
.
├── docs/
│   └── Architecture.md         # Detailed architectural documentation
├── electron/
│   ├── main.js                 # Electron main process
│   ├── preload.js              # IPC contextBridge preload script
│   ├── database/
│   │   ├── connection.js       # better-sqlite3 connection manager
│   │   └── schema.js           # Database initialization & migrations
│   └── ipc/
│       ├── index.js            # IPC handlers aggregator
│       └── databaseHandler.js  # DB IPC request handlers
├── src/
│   ├── main.jsx                # React 19 entry point
│   ├── App.jsx                 # Router config & layout routing
│   ├── components/             # Sidebar, Header components
│   ├── context/                # React contexts (reserved)
│   ├── hooks/                  # Custom React hooks (reserved)
│   ├── layouts/                # MainLayout wrapper
│   ├── pages/                  # Dashboard, Customers, Loans, Payments, Tasks, Reports, Settings
│   ├── services/               # databaseService (window.api bridge calls)
│   ├── styles/                 # index.css (Vanilla CSS design system)
│   └── utils/                  # Helper utilities (reserved)
├── index.html                  # HTML entry point for Vite
├── package.json
└── vite.config.js
```

---

## 🛡️ Security Policy

- `contextIsolation: true`
- `nodeIntegration: false`
- Direct filesystem, shell, or raw SQLite access from the renderer is strictly prohibited. All database interactions pass through validated IPC handlers in `electron/ipc/`.

