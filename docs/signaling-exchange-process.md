# ZerithDB Signaling Exchange Process

This document explains how the signaling mechanism works in ZerithDB and how peers establish a
WebRTC connection.

The implementation described here is based on the signaling flow inside `zerithdb-network`, mainly
in `NetworkManager`.

---

## Overview

ZerithDB uses **WebRTC** for peer-to-peer communication. Since browsers cannot directly discover
each other, a **WebSocket signaling server** is used during the initial connection phase.

The signaling server is responsible for:

- Discovering peers in a room
- Exchanging WebRTC offers and answers
- Relaying ICE candidates

After the connection is established, synchronization happens directly between peers over WebRTC data
channels. The signaling server is no longer involved in data transfer.

---

## High-Level Flow

````text
Peer A
   │
   ├── Connects to signaling server
   │
   ├── Receives peer list
   │
   ├── Sends WebRTC offer
   │
   ├── Receives answer
   │
   ├── Exchanges ICE candidates
   │
   └── Direct P2P connection established
   ---

## 1. Connecting to the Signaling Server

When a peer joins a room, ZerithDB creates a WebSocket connection to the signaling server through `NetworkManager.connect(roomId)`.

The signaling URL comes from the app configuration. If no custom URL is provided, ZerithDB uses the default signaling server.

Example from the implementation:

```ts
const signalingUrl =
  this.config.sync?.signalingUrl ??
  "wss://arpitkhandelwal810-zerith-signaling.hf.space";
````

The WebSocket connection includes:

- `room` → identifies the room being joined
- `peer` → uniquely identifies the local peer
- `powChallenge` and `powNonce` → Hashcash proof-of-work solution for the initial join

Example:

```text
wss://signal-server-url?room=my-room&peer=peer-id&powChallenge=...&powNonce=...
```

At this stage, the connection is only used for signaling and peer discovery. Application data is not
sent through the signaling server.

Before opening the WebSocket, the browser SDK fetches a short-lived challenge from:

```text
GET /pow/challenge?room=my-room&peer=peer-id
```

The signaling server signs the challenge and chooses the current difficulty based on active peer
load plus the configured `POW_THREAT_LEVEL`. Verification is intentionally fast: the server checks
the signature, expiration, replay cache, room/peer binding, and one SHA-256 digest. HTTP polling
uses the same puzzle in `POST /poll/join` under the `pow` field.

---

## 2. Peer Discovery

After connecting, the signaling server sends a list of peers already present in the room.

This is handled through:

```ts
case "peer-list":
```

For every discovered peer, ZerithDB creates a peer connection:

```ts
this.createPeer(peerId, true);
```

The `true` value marks the peer as the **initiator**, meaning it starts the WebRTC handshake.

---

## 3. Offer and Answer Exchange

After peer discovery, ZerithDB starts the WebRTC handshake using the offer/answer process.

### Creating the Offer

The initiator peer generates signaling data using `simple-peer`.

This data is emitted through:

```ts
peer.on("signal", (data) => {
```

An SDP offer is then sent through the signaling server:

```json
{
  "type": "offer",
  "from": "peerA",
  "to": "peerB",
  "payload": "sdp-data"
}
```

The signaling server forwards this offer to the target peer.

### Creating the Answer

When another peer receives an offer:

```ts
case "offer":
```

ZerithDB creates a non-initiator peer:

```ts
this.createPeer(msg.from, false, msg.payload);
```

The received offer is applied using:

```ts
peer.signal(offerPayload);
```

After this, `simple-peer` automatically generates an SDP answer and sends it back through the
signaling server.

The answer is handled using:

```ts
case "answer":
```

and applied to complete the connection setup.

---

## 4. ICE Candidate Exchange

After the offer and answer are exchanged, peers start sharing **ICE candidates**.

ICE candidates help peers find a working network path, especially when devices are on different
networks or behind NATs.

ZerithDB enables trickle ICE:

```ts
trickle: true;
```

This allows candidates to be exchanged gradually instead of waiting for all candidates to be
collected.

Incoming ICE candidates are handled through:

```ts
case "ice-candidate":
```

and applied using:

```ts
peer.signal(msg.payload);
```

For NAT traversal, ZerithDB uses public STUN servers:

```ts
[{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
```

---

## 5. Establishing the Peer Connection

Once the offer/answer exchange and ICE negotiation are complete, a direct WebRTC connection is
established.

This is handled through:

```ts
peer.on("connect", () => {
```

After a successful connection:

- The signaling server is no longer needed
- Peers communicate directly with each other
- Synchronization data flows through WebRTC data channels

---

## Connection Flow Diagram

```text
Peer A                         Signaling Server                         Peer B
   │                                   │                                  │
   ├──── Connect via WebSocket ─────▶ │                                  │
   │                                   │                                  │
   │ ◀──────────── Peer List ───────── │                                  │
   │                                   │                                  │
   ├──────────── Offer ──────────────▶ │ ─────────── Offer ────────────▶ │
   │                                   │                                  │
   │ ◀────────── Answer ────────────── │ ◀───────── Answer ───────────── │
   │                                   │                                  │
   ├────── ICE Candidates ───────────▶ │ ───── ICE Candidates ─────────▶ │
   │ ◀───── ICE Candidates ─────────── │ ◀──── ICE Candidates ───────── │
   │                                   │                                  │
   └──────────── Direct P2P Connection Established ────────────────────▶ │
```

## Conclusion

ZerithDB uses a lightweight signaling mechanism to establish WebRTC peer connections.

The signaling server is responsible only for:

- Peer discovery
- Offer and answer exchange
- ICE candidate relay

Once peers are connected, all synchronization occurs directly through WebRTC data channels, ensuring
a decentralized and privacy-first architecture.
