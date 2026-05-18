import { createApp } from "zerithdb-sdk";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: number; // Unix ms — used for display ordering
  authorKey: string; // DID public key of the original creator
};

// ---------------------------------------------------------------------------
// App instance
// ---------------------------------------------------------------------------
// createApp() initialises the local IndexedDB store (via Dexie) and sets up
// the CRDT engine (Yjs). It does NOT open a network connection yet — that
// only happens when app.sync.enable() is called or ZerithProvider mounts
// with sync: true.
//
// The signalingUrl is ONLY used for the initial WebRTC handshake. After peers
// connect, all traffic is direct. The relay never sees your data.

export const db = createApp({
  appId: "my-notes-app-v1", // namespaces this app's IndexedDB store
  sync: {
    signalingUrl: "wss://signal.zerithdb.dev", // hosted relay (swap for ws://localhost:4000 in LAN mode)
    autoReconnect: true, // retry when connectivity is restored
    reconnectDelay: 2000, // ms between retry attempts
  },
});
