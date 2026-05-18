<div align="center">

# 📝 ZerithDB Notes

**An offline-first collaborative notes app — built with ZerithDB, Electron, React & TypeScript.**

[![ZerithDB](https://img.shields.io/badge/ZerithDB-alpha-blueviolet?style=flat-square)](https://github.com/zerith-labs/zerithdb)
[![Electron](https://img.shields.io/badge/Electron-30-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

A production-grade reference implementation showing how to integrate
[ZerithDB](https://github.com/zerith-labs/zerithdb) into a real desktop application. Write notes
offline. Sync instantly when peers appear. No server. No conflicts. No data loss.

[Getting Started](#-getting-started) · [Architecture](#-architecture) ·
[Key Concepts](#-key-implementation-details) · [Known Issues](#-known-issues--workarounds) ·
[Build](#-build--distribution)

</div>

---

## Overview

This project is a minimal collaborative notes application that works **fully offline** and syncs
peer-to-peer when other instances are reachable. It is intentionally lean — the goal is to serve as
a clear, copy-paste reference for developers integrating ZerithDB into their own Electron apps.

All data is stored locally in **IndexedDB** via ZerithDB's Dexie adapter. Sync happens directly
between peers over **WebRTC**. A signaling server is used only to broker the initial handshake — it
never sees your data.

---

## ✨ What This Demonstrates

| Capability                   | Where                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| **Local-first writes**       | `db.db("notes").insert()` / `.update()` — writes to IndexedDB immediately, no network needed |
| **Offline reads**            | `db.db("notes").find()` — always reads from the local store                                  |
| **CRDT-based sync**          | ZerithDB's Yjs engine merges concurrent edits automatically on reconnect                     |
| **Keypair identity**         | `db.auth.signIn()` — generates/loads an Ed25519 keypair, no server required                  |
| **Cross-tab peer detection** | `BroadcastChannel` heartbeat — reliably detects other open instances                         |
| **OS connectivity events**   | `window online/offline` — badge updates instantly on network change                          |
| **Electron IPC**             | `net.isOnline()` in main process, `contextBridge` for safe renderer exposure                 |
| **Node.js polyfills**        | `vite.config.ts` `define` block — patches `global` and `process` for `simple-peer`           |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron                             │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  Renderer Process                   │   │
│   │                  (Chromium / Vite)                  │   │
│   │                                                     │   │
│   │   React UI ──► db.db("notes") ──► IndexedDB        │   │
│   │                      │                             │   │
│   │               zerithdb-sync (Yjs)                  │   │
│   │                      │                             │   │
│   │            zerithdb-network (WebRTC)               │   │
│   └──────────────────────┼──────────────────────────────┘   │
│                          │                                  │
│   ┌───────────────────────────────────────────────────┐     │
│   │              Main Process (Node.js)               │     │
│   │   electron/main.js  ──  net.isOnline()            │     │
│   │   electron/preload.js ── contextBridge            │     │
│   └───────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
              WebRTC (direct after handshake)
                           │
              ┌────────────▼────────────┐
              │   Signaling Server      │
              │  wss://signal.zerithdb  │
              │  (handshake only)       │
              └─────────────────────────┘
```

> **Data never passes through the signaling server.** It brokers peer discovery only. Once two
> instances connect, the relay is completely out of the picture.

---

## 📁 Project Structure

```
my-notes-app/
│
├── electron/
│   ├── main.js                 # Electron main process — BrowserWindow, net.isOnline()
│   └── preload.js              # contextBridge — exposes network-change IPC to renderer
│
├── src/
│   ├── db.ts                   # createApp() singleton + Note type definition
│   ├── auth.ts                 # ensureIdentity() / getPublicKey() — Ed25519 keypair
│   ├── main.tsx                # Bootstrap: auth → db.sync.enable() → React root
│   ├── App.tsx                 # Top-level layout — sidebar + editor, selectedNote state
│   ├── index.css               # All styles (dark sidebar, editor pane, sync badge)
│   │
│   └── components/
│       ├── NoteList.tsx        # Custom useNotes hook — polls db.db("notes").find()
│       ├── NoteEditor.tsx      # Insert / update / delete — all writes offline-safe
│       └── SyncStatus.tsx      # BroadcastChannel heartbeat + window online/offline
│
├── index.html                  # Vite entry point
├── vite.config.ts              # Aliases + Node.js global polyfills for simple-peer
├── tsconfig.json
├── package.json
├── electron-builder.config.js  # Output: dist/ (win-unpacked + NSIS installer)
└── .gitignore
```

---

## ✅ Prerequisites

| Requirement      | Version                               |
| ---------------- | ------------------------------------- |
| Node.js          | ≥ 18.0.0                              |
| npm              | ≥ 9.0.0                               |
| Operating System | Windows 10+, macOS 12+, Ubuntu 20.04+ |

---

## 🚀 Getting Started

**1. Clone and install**

```bash
git clone https://github.com//chavanGaneshDatta//zerithdb-electron-starter-template.git
cd zerithdb-electron-starter-template
npm install
```

**2. Start in development mode**

```bash
npm run dev
```

This runs Vite's dev server at `http://localhost:5173` and launches Electron simultaneously via
`concurrently`. In development, the Electron window loads the Vite dev server. In production it
loads the built `dist/index.html`.

**3. Verify it's working**

- The Electron window opens with a dark sidebar and a blank editor pane.
- The sync badge reads `● Offline — changes saved locally`
- Open a second browser tab at `http://localhost:5173` — the badge in both tabs updates to
  `✓ Synced · 1 peer` within ~2 seconds.
- Create a note in one tab — it appears in the other tab's list automatically.

---

## ⚙️ Configuration

All ZerithDB configuration lives in `src/db.ts`:

```ts
export const db = createApp({
  appId: "my-notes-app-v1", // Namespaces the local IndexedDB store.
  // Change this to isolate data between app versions.
  sync: {
    signalingUrl: "wss://signal.zerithdb.dev", // Swap for ws://localhost:4000 in LAN mode
    autoReconnect: true, // Retry P2P connection on network restore
    reconnectDelay: 2000, // ms between reconnect attempts
  },
});
```

**Environment-based config** (recommended for production):

```ts
signalingUrl: import.meta.env.VITE_SIGNAL_URL ?? "wss://signal.zerithdb.dev",
```

Create a `.env` file at the project root:

```env
VITE_SIGNAL_URL=ws://192.168.1.10:4000
```

---

## 🔑 Key Implementation Details

### ZerithDB Initialisation

`createApp()` is called once in `src/db.ts` and exported as a singleton. It initialises the local
IndexedDB store immediately — no network connection is made at this point.

```ts
// src/db.ts
export const db = createApp({ appId: "my-notes-app-v1", sync: { ... } });
```

Sync is enabled explicitly after identity is established in `src/main.tsx`:

```ts
await ensureIdentity();
db.sync.enable(); // connects when online, queues writes when offline
```

This ordering guarantees every write is signed with the correct keypair from the very first
operation.

---

### Offline Writes

All writes go to the local CRDT store first. There is no "save failed" state — if IndexedDB is
available, the write succeeds immediately.

```ts
// INSERT — works with zero connectivity
await db.db("notes").insert({
  id,
  title,
  body,
  tags: [],
  updatedAt: Date.now(),
  authorKey: getPublicKey(),
});

// UPDATE — Yjs merges concurrent edits from peers automatically on reconnect
await db.db("notes").update({ id: note.id }, { title, body, updatedAt: Date.now() });

// DELETE — propagated to peers as a CRDT tombstone
await db.db("notes").delete({ id: note.id });
```

---

### Live Queries

`zerithdb-react`'s `useQuery` hook is not yet stable in the published alpha. This project implements
a custom `useNotes` hook in `NoteList.tsx` that calls the imperative API directly:

```ts
const result = await db.db("notes").find({});
result.sort((a, b) => b.updatedAt - a.updatedAt);
```

Reactivity comes from two sources:

1. ZerithDB `db.sync.on("synced")` and `db.sync.on("change")` events (best-effort, alpha API).
2. A **2-second polling interval** as a reliable fallback so the list is always fresh.

This will be replaced with the official `useQuery` hook once `zerithdb-react` stabilises.

---

### Peer Detection

`db.sync.on("peer-joined")` is not yet implemented in the published alpha. `SyncStatus.tsx` uses the
browser's native `BroadcastChannel` API instead:

- Each tab broadcasts a `heartbeat` message containing a UUID every 2 seconds.
- Tabs that haven't sent a heartbeat in 6 seconds are considered gone.
- The peer count and badge status update accordingly.

This provides a lightweight best-effort peer visibility mechanism for local instances, and will be
replaced with ZerithDB's native peer events once they're available.

---

### Keypair Authentication

```ts
// src/auth.ts
identity = await db.auth.signIn();
// → { publicKey: "did:key:z6Mk..." }
```

`db.auth.signIn()` generates a new Ed25519 keypair on first call and persists it to the local store.
On subsequent calls it loads the existing key. **No network request is made. No server is
involved.** The public key is a W3C DID (`did:key:...`) and is stored as `authorKey` on every note
for authorship attribution.

---

## ⚠️ Known Issues & Workarounds

These are limitations of the ZerithDB **alpha SDK**, not of this integration pattern. Each has a
working workaround in place.

### Peer Synchronization Status

Peer-to-peer synchronization currently depends on ZerithDB alpha networking APIs and signaling
availability.

Local offline persistence is fully functional and production-tested independently of peer
connectivity.

This starter template prioritizes:

- offline durability,
- local-first writes,
- Electron persistence,
- and production packaging stability.

| Issue                                             | Root Cause                         | Workaround                                                     |
| ------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `useQuery` not exported by `zerithdb-react`       | Alpha package incomplete           | Custom `useNotes` hook with `db.db().find()` + polling         |
| `useSyncStatus` not exported by `zerithdb-react`  | Alpha package incomplete           | Custom hook using `BroadcastChannel` + `window` events         |
| `ZerithProvider` not exported by `zerithdb-react` | Alpha package incomplete           | Removed; `db.sync.enable()` called directly in `main.tsx`      |
| `@zerithdb/*` sub-packages not resolved by Vite   | SDK built for monorepo workspace   | `resolve.alias` in `vite.config.ts` maps to published packages |
| `ReferenceError: global is not defined`           | `simple-peer` uses Node.js globals | `define: { global: "globalThis" }` in `vite.config.ts`         |
| `navigator is not defined` in Electron main       | `navigator` is browser-only        | Replaced with `net.isOnline()` from Electron's `net` module    |
| `db.sync.on("peer-joined")` never fires           | Event emitter not yet implemented  | `BroadcastChannel` heartbeat as described above                |

---

## 📦 Build & Distribution

```bash
npm run build
```

Output structure:

```
dist/                               ← Vite renderer bundle (loaded by Electron in production)
  └── win-unpacked/                 ← Unpacked app directory (Windows)
      ├── my-notes-app.exe
      └── resources/
dist/
  └── my-notes-app Setup 0.1.0.exe  ← NSIS installer (ready to distribute)
```

> **Note:** The output directory is `dist/` (not `dist-electron/`). The NSIS installer is the file
> you distribute to end users. The `win-unpacked/` folder is the portable version — useful for
> testing without running the installer.

To build for a specific platform only:

```bash
npx electron-builder --mac     # → .dmg
npx electron-builder --win     # → NSIS .exe installer
npx electron-builder --linux   # → .AppImage
```

Platform targets are configured in `electron-builder.config.js`.

---

## 🌐 LAN / Air-Gapped Mode

To run entirely without internet (e.g. a closed office network):

**Step 1 — Start the signaling server on one machine:**

```bash
npx zerithdb signal --port 4000
```

**Step 2 — Find that machine's local IP:**

```bash
# macOS / Linux
ifconfig | grep inet

# Windows
ipconfig
```

**Step 3 — Update `src/db.ts`:**

```ts
signalingUrl: "ws://192.168.1.10:4000",   // replace with actual LAN IP
```

All instances on the same network will now discover each other without any internet access. The
signaling server can even be stopped after peers have connected — sync continues directly between
them.

---

## 🔌 Offline Behaviour Reference

| Scenario                             | Behaviour                                                            |
| ------------------------------------ | -------------------------------------------------------------------- |
| App starts with no internet          | Loads all notes from local IndexedDB — zero latency, zero errors     |
| User creates / edits a note offline  | Written to local CRDT store immediately; queued for sync             |
| Connectivity restored                | CRDT engine replays queued ops and merges with peers                 |
| Two users edit the same note offline | Yjs merges both edits without data loss or user prompt               |
| App closed mid-sync                  | IndexedDB state is durable — no data lost on restart                 |
| Network flaps repeatedly             | `autoReconnect: true` retries silently; badge reflects current state |
| Second tab or window opened          | `BroadcastChannel` detects it within ~2 s; badge shows peer count    |

---

## 🤝 Contributing

Pull requests are welcome. Before submitting, please verify:

- [ ] `npm run dev` starts without errors
- [ ] Creating, editing, and deleting notes works while offline
- [ ] The sync badge transitions correctly between `offline`, `connecting`, and `synced`
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] The **Known Issues** table is updated if any upstream ZerithDB alpha behaviour has changed

When `zerithdb-react` export stabilise, the custom hooks (`useNotes`, `useSyncStatus`) should be
replaced with the official `useQuery` and `useSyncStatus` hooks.

---

## 📄 License

MIT © Ganesh

---

<div align="center">

**Built with [ZerithDB](https://github.com/zerith-labs/zerithdb) ·
[Electron](https://www.electronjs.org/) · [React](https://react.dev/) ·
[Vite](https://vitejs.dev/)**

> ⚠️ **This project targets ZerithDB alpha.** The SDK's public API is subject to change.  
> Pin a specific version of `zerithdb-sdk` in `package.json` for any production use rather than
> `"latest"`.

</div>
