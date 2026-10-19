# Sri Gold Pawn Shop Billing - Architecture Specification

## 1. System Architecture Diagram

```
+-------------------------------------------------------------------+
|                        REACT RENDERER PROCESS                     |
|                                                                   |
|   +-------------------+    +-------------------+                  |
|   |  React Components | -> |  React Services   |                  |
|   +-------------------+    +---------+---------+                  |
|                                      |                            |
|                               window.api.database                 |
+--------------------------------------|----------------------------+
                                       | Context Bridge / IPC
+--------------------------------------|----------------------------+
|                            PRELOAD LAYER                          |
|                                      v                            |
|                       ipcRenderer.invoke('db:get-status')         |
+--------------------------------------|----------------------------+
                                       | Main Process IPC Channel
+--------------------------------------|----------------------------+
|                        ELECTRON MAIN PROCESS                      |
|                                      v                            |
|                     ipcMain.handle('db:get-status')               |
|                                      |                            |
|                        electron/database/connection.js            |
|                                      |                            |
|                        better-sqlite3 Native Driver               |
|                                      v                            |
|                     SQLite File (%APPDATA%/userData/*.sqlite)     |
+-------------------------------------------------------------------+
```

## 2. Process & Security Isolation

- **No Direct Node Access in Renderer**: `nodeIntegration: false` and `contextIsolation: true` prevent malicious scripts or injected dependencies from accessing filesystem (`fs`), `child_process`, or native binaries.
- **Controlled API Surface**: `electron/preload.js` exposes only explicit functions attached to `window.api`.
- **Database Boundary**: `better-sqlite3` runs exclusively inside `electron/main.js` and `electron/database/`. Data is passed across IPC boundaries using serialized JSON-serializable DTO objects.

## 3. Database Strategy

- **Storage Location**: `app.getPath('userData')` ensures user data persists outside the application bundle and source directory across updates.
- **Engine**: SQLite running via `better-sqlite3` with `journal_mode = WAL` and `foreign_keys = ON` enabled.
- **Migration & Versioning**: Schema version is stored in `_schema_meta` system table. Phase 1 establishes the connection and migration runner. Business entity tables will be added in Phase 2.

