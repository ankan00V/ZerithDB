# WebRTC Signaling & Fallback Mechanisms

## Overview

ZerithDB uses WebRTC to establish direct peer-to-peer connections between browsers. Before two peers
can communicate directly, they need to exchange connection metadata (ICE candidates and session
descriptions). This exchange is handled by a **signaling server** — a lightweight WebSocket relay
that brokers the initial handshake.

> **Important:** The signaling server never sees your data. It only facilitates peer discovery. Once
> a WebRTC connection is established, all communication is direct and encrypted between peers.

---

## What Happens During Normal Signaling

```
Peer A                  Signaling Server              Peer B
  │                           │                          │
  │── connect(appId) ────────▶│◀──── connect(appId) ────│
  │                           │                          │
  │── offer (SDP) ───────────▶│─── forward offer ───────▶│
  │                           │                          │
  │◀── answer (SDP) ──────────│◀── answer (SDP) ─────────│
  │                           │                          │
  │◀══════════ Direct WebRTC connection established ═════▶│
  │                           │   (signaling no longer   │
  │                           │    needed for this pair) │
```

1. Both peers connect to the signaling server using the same `appId`.
2. Peer A sends an **offer** (SDP — Session Description Protocol) to Peer B via the server.
3. Peer B responds with an **answer**.
4. Both peers exchange **ICE candidates** (possible network paths).
5. WebRTC selects the best path and establishes a direct connection.
6. The signaling server is no longer involved in that peer pair's communication.

---

## What Happens When Signaling Fails

Signaling can fail for several reasons:

| Cause                              | Symptom                                   |
| ---------------------------------- | ----------------------------------------- |
| Signaling server is down           | WebSocket connection refused or timed out |
| Network firewall blocks WebSockets | Connection hangs, then times out          |
| Server overloaded                  | Slow or dropped messages                  |
| Offline / no internet              | Immediate connection failure              |

When signaling fails, ZerithDB cannot broker new peer connections. **Existing** peer connections
(already established via WebRTC) are unaffected and continue to work.

---

## Fallback Mechanisms

ZerithDB handles signaling failures through a layered fallback strategy:

### 1. Automatic Reconnection

If the WebSocket connection to the signaling server drops, ZerithDB automatically attempts to
reconnect using **exponential backoff**:

```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
Attempt 4: wait 8s
... (capped at 30s)
```

The SDK emits events you can listen to:

```ts
app.sync.on("signaling:disconnected", () => {
  console.warn("Signaling server unreachable. Retrying...");
});

app.sync.on("signaling:reconnected", () => {
  console.log("Signaling server reconnected.");
});
```

### 2. Multiple Signaling Servers (Failover)

You can provide an array of signaling URLs. ZerithDB will try each in order if the primary fails:

```ts
const app = createApp({
  appId: "my-app",
  sync: {
    signalingUrl: [
      "wss://signal.zerithdb.dev", // primary (hosted)
      "wss://signal-eu.zerithdb.dev", // secondary (regional)
      "ws://localhost:4000", // fallback (local dev)
    ],
  },
});
```

ZerithDB cycles through the list until a connection succeeds. If all servers fail, it falls back to
offline mode and retries in the background.

### 3. Offline / Local-Only Mode

ZerithDB is **local-first**. If signaling is unavailable entirely, the app continues to function:

- All reads and writes work against the local IndexedDB store.
- Changes are queued and sync automatically when connectivity is restored.
- Peers already connected via WebRTC continue syncing with each other.

No special configuration is needed — this is the default behavior.

### 4. Same-Tab / Same-Origin Sync (No Signaling Required)

For peers on the same device or browser origin, ZerithDB uses the **BroadcastChannel API** as a
zero-latency fallback that bypasses the signaling server entirely:

```
Tab A ──BroadcastChannel──▶ Tab B   (no signaling needed)
```

This means multi-tab sync always works, even fully offline.

---

## Checking Signaling Status Programmatically

```ts
const status = app.sync.signalingStatus();
// Returns: 'connected' | 'connecting' | 'disconnected' | 'offline'

if (status === "disconnected") {
  // Show user a warning banner
}
```

---

## Self-Hosting a Signaling Server

For production apps, we recommend self-hosting to avoid dependency on ZerithDB's hosted relay:

```bash
# Start a local signaling server
npx zerithdb signal --port 4000

# Or with Docker
docker run -p 4000:4000 zerithdb/signal-server
```

Self-hosted servers give you full control over uptime and can be placed in multiple regions for
geographic redundancy.

### Proof-of-Work Handshake Protection

The self-hosted signaling server requires a lightweight Hashcash proof-of-work solution before a
peer can join a room. This makes large Sybil floods expensive while keeping verification cheap for
the server.

The browser SDK handles this automatically:

1. Fetch `GET /pow/challenge?room=<roomId>&peer=<peerId>`.
2. Solve the returned `hashcash-sha256` challenge locally.
3. Attach the solution to the WebSocket join URL as `powChallenge` and `powNonce`, or to
   `POST /poll/join` as `{ "pow": { "challenge": "...", "nonce": "..." } }`.

Example direct WebSocket join:

```text
wss://signal.example.com?room=my-room&peer=peer-123&powChallenge=<challenge>&powNonce=<nonce>
```

Operator tuning:

| Variable                       | Default | Purpose                                                   |
| ------------------------------ | ------- | --------------------------------------------------------- |
| `POW_ENABLED`                  | `true`  | Set to `false` only for trusted local development         |
| `POW_BASE_DIFFICULTY`          | `12`    | Baseline leading-zero bits required                       |
| `POW_MAX_DIFFICULTY`           | `24`    | Upper bound for automatic scaling                         |
| `POW_LOAD_STEP`                | `25`    | Add one difficulty bit per N active peers                 |
| `POW_THREAT_LEVEL`             | `0`     | Manual threat bump; each level adds two difficulty bits   |
| `POW_CHALLENGE_TTL_MS`         | `60000` | Challenge expiration window                               |
| `POW_SECRET`                   | random  | HMAC secret for challenge integrity; set in multi-region  |
| `POW_CHALLENGE_RATE_LIMIT`     | `120`   | Max challenge requests per remote address per window      |
| `POW_CHALLENGE_RATE_WINDOW_MS` | `60000` | Rate-limit window for challenge requests                  |
| `POW_TRUST_X_FORWARDED_FOR`    | `false` | Use only behind a trusted proxy that controls this header |

Performance notes:

- Server verification performs one HMAC check and one SHA-256 digest, then records the solution in a
- TTL-bound replay cache using a fixed-size hash key rather than storing full challenge strings.
- Challenge minting is rate-limited per remote address so attackers cannot freely amplify load by
  repeatedly requesting new puzzles.
- Default difficulty is intentionally low so normal joins complete quickly on common browsers.
- The browser solver yields periodically and stops if the challenge expires while solving.
- During an attack, raise `POW_THREAT_LEVEL` or lower `POW_LOAD_STEP` to increase client CPU cost
  without increasing server-side verification cost.

---

## Summary

| Scenario                   | Behavior                                     |
| -------------------------- | -------------------------------------------- |
| Signaling server drops     | Auto-reconnect with exponential backoff      |
| Primary server down        | Failover to next URL in `signalingUrl` array |
| All servers unreachable    | Offline mode — local reads/writes continue   |
| Same browser / tab         | BroadcastChannel — no signaling needed       |
| Existing WebRTC connection | Unaffected by signaling failures             |

> For related topics, see [Architecture Overview](../ARCHITECTURE.md) and
> [Issue #183 — Multiple Signaling Servers](https://github.com/Zerith-Labs/ZerithDB/issues/183).
