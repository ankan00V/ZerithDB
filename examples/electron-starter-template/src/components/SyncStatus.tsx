// import { useState, useEffect } from "react";
// import { db } from "../db";

// // ---------------------------------------------------------------------------
// // useSyncStatus (custom — zerithdb-react doesn't export this hook yet in alpha)
// // ---------------------------------------------------------------------------
// // Combines two signal sources:
// //   1. Browser online/offline events  → immediate OS-level connectivity
// //   2. ZerithDB sync event emitter    → peer join/leave and CRDT sync state
// //
// // Falls back gracefully if the sync event API isn't available yet.

// type Status = "offline" | "connecting" | "syncing" | "synced";

// function useSyncStatus() {
//   const [status, setStatus] = useState<Status>(
//     navigator.onLine ? "connecting" : "offline"
//   );
//   const [peers, setPeers] = useState(0);

//   useEffect(() => {
//     // --- Browser network events -------------------------------------------
//     const goOnline  = () => setStatus((s) => s === "offline" ? "connecting" : s);
//     const goOffline = () => { setStatus("offline"); setPeers(0); };

//     window.addEventListener("online",  goOnline);
//     window.addEventListener("offline", goOffline);

//     // --- ZerithDB sync events (best-effort; API is alpha) -----------------
//     try {
//       db.sync.on("peer-joined", () => {
//         setPeers((p) => p + 1);
//         setStatus("synced");
//       });
//       db.sync.on("peer-left", () => {
//         setPeers((p) => {
//           const next = Math.max(0, p - 1);
//           if (next === 0) setStatus("connecting");
//           return next;
//         });
//       });
//       db.sync.on("syncing", () => setStatus("syncing"));
//       db.sync.on("synced",  () => setStatus("synced"));
//     } catch {
//       // sync event emitter not available in this build — browser events only
//     }

//     return () => {
//       window.removeEventListener("online",  goOnline);
//       window.removeEventListener("offline", goOffline);
//       try { db.sync.removeAllListeners?.(); } catch { /* noop */ }
//     };
//   }, []);

//   return { status, peers };
// }

// // ---------------------------------------------------------------------------
// // SyncStatus component
// // ---------------------------------------------------------------------------

// export function SyncStatus() {
//   const { status, peers } = useSyncStatus();

//   const label: Record<Status, string> = {
//     offline:    "● Offline — changes saved locally",
//     connecting: "◌ Connecting to peers…",
//     syncing:    "⟳ Syncing…",
//     synced:     `✓ Synced · ${peers} peer${peers !== 1 ? "s" : ""}`,
//   };

//   return (
//     <div className={`sync-status sync-status--${status}`} title={label[status]}>
//       {label[status]}
//     </div>
//   );
// }

import { useState, useEffect } from "react";
import { db } from "../db";

// ---------------------------------------------------------------------------
// useSyncStatus
// ---------------------------------------------------------------------------
// Offline-first status handling for ZerithDB Electron starter template.
// Peer sync events are treated as best-effort because the ZerithDB alpha SDK
// does not yet reliably expose all sync emitter events.

type Status = "offline" | "connecting" | "syncing" | "synced";

function useSyncStatus() {
  // Default to offline-first mode.
  // This app guarantees local persistence even without peers/network.
  const [status, setStatus] = useState<Status>("offline");
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    // --- Browser network events -------------------------------------------
    const goOnline = () => {
      // Only indicate connecting when internet becomes available.
      setStatus("connecting");
    };

    const goOffline = () => {
      setStatus("offline");
      setPeers(0);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // --- ZerithDB sync events (best-effort; alpha SDK) --------------------
    try {
      db.sync.on("peer-joined", () => {
        setPeers((p) => p + 1);
        setStatus("synced");
      });

      db.sync.on("peer-left", () => {
        setPeers((p) => {
          const next = Math.max(0, p - 1);

          if (next === 0) {
            setStatus(navigator.onLine ? "connecting" : "offline");
          }

          return next;
        });
      });

      db.sync.on("syncing", () => {
        setStatus("syncing");
      });

      db.sync.on("synced", () => {
        setStatus("synced");
      });
    } catch {
      // Sync emitter not available in current SDK build.
      // App still functions fully offline using local persistence.
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);

      try {
        db.sync.removeAllListeners?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { status, peers };
}

// ---------------------------------------------------------------------------
// SyncStatus component
// ---------------------------------------------------------------------------

export function SyncStatus() {
  const { status, peers } = useSyncStatus();

  const label: Record<Status, string> = {
    offline: "● Offline — changes saved locally",
    connecting: "◌ Looking for peers…",
    syncing: "⟳ Syncing…",
    synced: `✓ Synced · ${peers} peer${peers !== 1 ? "s" : ""}`,
  };

  return (
    <div className={`sync-status sync-status--${status}`} title={label[status]}>
      {label[status]}
    </div>
  );
}
