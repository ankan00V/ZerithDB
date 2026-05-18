import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import * as Y from "yjs";
import { DbClient } from "../../packages/db/src/db-client.js";
import { SyncEngine } from "../../packages/sync/src/sync-engine.js";
import { EventEmitter, type ZerithDBConfig } from "../../packages/core/src/index.js";

/**
 * A Virtual Router that intercepts, drops, delays, and partitions messages
 * between virtual peers to simulate real-world P2P network instability.
 */
class VirtualRouter {
  private peers = new Map<string, VirtualNetworkManager>();
  private latencyMin = 0;
  private latencyMax = 0;
  private packetLossRate = 0.0;
  private disconnectedPeers = new Set<string>();
  private partitions = new Set<string>();

  register(peerId: string, manager: VirtualNetworkManager) {
    this.peers.set(peerId, manager);
  }

  unregister(peerId: string) {
    this.peers.delete(peerId);
  }

  setLatency(min: number, max: number) {
    this.latencyMin = min;
    this.latencyMax = max;
  }

  setPacketLossRate(rate: number) {
    this.packetLossRate = rate;
  }

  setPeerOffline(peerId: string, offline: boolean) {
    if (offline) {
      if (!this.disconnectedPeers.has(peerId)) {
        this.disconnectedPeers.add(peerId);
        for (const [otherId, otherManager] of this.peers.entries()) {
          if (otherId !== peerId) {
            otherManager.simulateDisconnect(peerId);
            this.peers.get(peerId)?.simulateDisconnect(otherId);
          }
        }
      }
    } else {
      if (this.disconnectedPeers.has(peerId)) {
        this.disconnectedPeers.delete(peerId);
        for (const [otherId, otherManager] of this.peers.entries()) {
          if (otherId !== peerId && !this.disconnectedPeers.has(otherId) && !this.isPartitioned(peerId, otherId)) {
            otherManager.simulateConnect(peerId);
            this.peers.get(peerId)?.simulateConnect(otherId);
          }
        }
      }
    }
  }

  setPartition(peerA: string, peerB: string, blocked: boolean) {
    const key = [peerA, peerB].sort().join(":");
    if (blocked) {
      if (!this.partitions.has(key)) {
        this.partitions.add(key);
        this.peers.get(peerA)?.simulateDisconnect(peerB);
        this.peers.get(peerB)?.simulateDisconnect(peerA);
      }
    } else {
      if (this.partitions.has(key)) {
        this.partitions.delete(key);
        if (!this.disconnectedPeers.has(peerA) && !this.disconnectedPeers.has(peerB)) {
          this.peers.get(peerA)?.simulateConnect(peerB);
          this.peers.get(peerB)?.simulateConnect(peerA);
        }
      }
    }
  }

  isPartitioned(peerA: string, peerB: string): boolean {
    const key = [peerA, peerB].sort().join(":");
    return this.partitions.has(key);
  }

  route(from: string, to: string, msg: any) {
    if (this.disconnectedPeers.has(from) || this.disconnectedPeers.has(to)) {
      return; // Dropped: one peer is offline
    }
    if (this.isPartitioned(from, to)) {
      return; // Dropped: network partition blocks link
    }
    if (Math.random() < this.packetLossRate) {
      return; // Dropped: packet loss
    }

    const dest = this.peers.get(to);
    if (!dest) return;

    const latency = this.latencyMin + Math.random() * (this.latencyMax - this.latencyMin);
    if (latency > 0) {
      setTimeout(() => {
        dest.receiveMessage(from, msg);
      }, latency);
    } else {
      dest.receiveMessage(from, msg);
    }
  }
}

/**
 * Mocks the public interface of NetworkManager so we can run complete
 * SyncEngines in-memory under Vitest without native browser WebRTC APIs.
 */
class VirtualNetworkManager extends EventEmitter<any> {
  readonly peerId: string;
  private readonly router: VirtualRouter;
  private connectedPeersList = new Set<string>();

  constructor(peerId: string, router: VirtualRouter) {
    super();
    this.peerId = peerId;
    this.router = router;
    this.router.register(peerId, this);
  }

  get connectedPeerCount(): number {
    return this.connectedPeersList.size;
  }

  broadcast(message: { type: string; payload: string | Uint8Array }): void {
    for (const otherId of this.connectedPeersList) {
      this.router.route(this.peerId, otherId, message);
    }
  }

  sendTo(peerId: string, message: { type: string; payload: string | Uint8Array }): void {
    if (this.connectedPeersList.has(peerId)) {
      this.router.route(this.peerId, peerId, message);
    }
  }

  receiveMessage(from: string, msg: any) {
    this.emit("message", {
      type: msg.type,
      payload: msg.payload,
      from,
    });
  }

  simulateConnect(peerId: string) {
    if (!this.connectedPeersList.has(peerId)) {
      this.connectedPeersList.add(peerId);
      this.emit("peer:connected", {
        peerId,
        did: "",
        publicKey: "",
        connectedAt: Date.now(),
      });
    }
  }

  simulateDisconnect(peerId: string) {
    if (this.connectedPeersList.has(peerId)) {
      this.connectedPeersList.delete(peerId);
      this.emit("peer:disconnected", { peerId });
    }
  }

  dispose() {
    this.router.unregister(this.peerId);
  }
}

/**
 * Simulates connection drops, packet delay, data corruption, and
 * partitions over virtual P2P networks at specified intervals.
 */
class P2PChaosMonkey {
  private active = false;
  private intervalId: any = null;

  constructor(
    private readonly router: VirtualRouter,
    private readonly peerIds: string[]
  ) {}

  start(intervalMs = 50) {
    this.active = true;
    this.intervalId = setInterval(() => {
      if (!this.active) return;

      const action = Math.random();
      if (action < 0.25) {
        // Drop a random peer offline
        const peer = this.peerIds[Math.floor(Math.random() * this.peerIds.length)]!;
        this.router.setPeerOffline(peer, true);
      } else if (action < 0.5) {
        // Bring a random offline peer back online
        const peer = this.peerIds[Math.floor(Math.random() * this.peerIds.length)]!;
        this.router.setPeerOffline(peer, false);
      } else if (action < 0.75) {
        // Partition a pair of peers
        const idxA = Math.floor(Math.random() * this.peerIds.length);
        let idxB = Math.floor(Math.random() * this.peerIds.length);
        if (idxA === idxB) idxB = (idxA + 1) % this.peerIds.length;
        this.router.setPartition(this.peerIds[idxA]!, this.peerIds[idxB]!, true);
      } else {
        // Reconnect a partition pair, inject high latency and loss
        const idxA = Math.floor(Math.random() * this.peerIds.length);
        let idxB = Math.floor(Math.random() * this.peerIds.length);
        if (idxA === idxB) idxB = (idxA + 1) % this.peerIds.length;
        this.router.setPartition(this.peerIds[idxA]!, this.peerIds[idxB]!, false);
        this.router.setLatency(10, 40);
        this.router.setPacketLossRate(0.3);
      }
    }, intervalMs);
  }

  stop() {
    this.active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Fully restore all network connections to perfect state
    this.router.setLatency(0, 0);
    this.router.setPacketLossRate(0);
    for (const id of this.peerIds) {
      this.router.setPeerOffline(id, false);
    }
    for (let i = 0; i < this.peerIds.length; i++) {
      for (let j = i + 1; j < this.peerIds.length; j++) {
        this.router.setPartition(this.peerIds[i]!, this.peerIds[j]!, false);
      }
    }
  }
}

describe("P2P Chaos Engineering & Strong Eventual Consistency", () => {
  let router: VirtualRouter;
  let peers: Array<{
    id: string;
    db: DbClient;
    network: VirtualNetworkManager;
    sync: SyncEngine;
  }>;
  const peerNames = ["Alice", "Bob", "Charlie"];

  beforeEach(async () => {
    router = new VirtualRouter();
    peers = [];

    // Create 3 isolated peers with their own DbClient and SyncEngine instances
    for (const name of peerNames) {
      const appId = `app-${name.toLowerCase()}-${Math.random().toString(36).slice(2)}`;
      const config: ZerithDBConfig = {
        appId,
        sync: {
          ephemeral: { throttleMs: 0 },
        },
      };

      const db = new DbClient(config);
      const network = new VirtualNetworkManager(name, router);
      const sync = new SyncEngine(config, db, network as any);

      peers.push({ id: name, db, network, sync });
    }

    // Connect all peers initially in a full mesh topology
    for (let i = 0; i < peers.length; i++) {
      for (let j = 0; j < peers.length; j++) {
        if (i !== j) {
          peers[i]!.network.simulateConnect(peers[j]!.id);
        }
      }
    }

    // Enable sync on all peers
    for (const peer of peers) {
      peer.sync.enable();
    }
  });

  afterEach(async () => {
    for (const peer of peers) {
      await peer.sync.dispose();
      await peer.db.dispose();
      peer.network.dispose();
      
      const req = indexedDB.deleteDatabase(`zerithdb_${peer.db.appId}`);
      await new Promise<void>((resolve) => {
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }
  });

  it("should successfully sync values under normal network conditions", async () => {
    const alice = peers[0]!;
    const bob = peers[1]!;

    const docAlice = alice.sync.getDoc("todos");
    const ymapAlice = docAlice.getMap("data");

    // Perform local write on Alice
    docAlice.transact(() => {
      ymapAlice.set("item-1", { text: "Buy milk", done: false });
    });

    // Wait a brief moment for propagation
    await new Promise((r) => setTimeout(r, 80));

    // Verify Bob's Y.Doc has synchronized to exactly match Alice's state
    const docBob = bob.sync.getDoc("todos");
    const ymapBob = docBob.getMap("data");
    expect(ymapBob.get("item-1")).toEqual({ text: "Buy milk", done: false });
  });

  it("should reach Strong Eventual Consistency after simulated packet loss and high latency", async () => {
    // 1. Inject network instability
    router.setLatency(15, 30);
    router.setPacketLossRate(0.25); // 25% packet loss

    const alice = peers[0]!;
    const bob = peers[1]!;
    const charlie = peers[2]!;

    const docAlice = alice.sync.getDoc("todos");
    const docBob = bob.sync.getDoc("todos");
    const docCharlie = charlie.sync.getDoc("todos");

    // Perform concurrent writes on Alice and Charlie
    docAlice.transact(() => {
      docAlice.getMap("data").set("task-alice", "Alice finished first");
    });
    docCharlie.transact(() => {
      docCharlie.getMap("data").set("task-charlie", "Charlie finished second");
    });

    // Wait a bit to let messages retry and flow under high-stress conditions
    await new Promise((r) => setTimeout(r, 200));

    // 2. Resolve network instability (0 latency, 0 packet loss)
    router.setLatency(0, 0);
    router.setPacketLossRate(0);

    // Wait for the final queue flushes and synchronization to complete
    await new Promise((r) => setTimeout(r, 150));

    // 3. Assert all nodes reached identical, consistent states
    const stateAlice = docAlice.getMap("data").toJSON();
    const stateBob = docBob.getMap("data").toJSON();
    const stateCharlie = docCharlie.getMap("data").toJSON();

    expect(stateBob).toEqual(stateAlice);
    expect(stateCharlie).toEqual(stateAlice);
    expect(stateAlice["task-alice"]).toBe("Alice finished first");
    expect(stateAlice["task-charlie"]).toBe("Charlie finished second");
  });

  it("should reach Strong Eventual Consistency after network partitions are healed", async () => {
    const alice = peers[0]!;
    const bob = peers[1]!;
    const charlie = peers[2]!;

    // 1. Partition Alice/Bob from Charlie
    // Alice and Bob can talk, but Charlie is completely isolated!
    router.setPartition("Alice", "Charlie", true);
    router.setPartition("Bob", "Charlie", true);

    const docAlice = alice.sync.getDoc("todos");
    const docCharlie = charlie.sync.getDoc("todos");

    // Write a document on Alice (should propagate to Bob immediately, but NOT Charlie)
    docAlice.transact(() => {
      docAlice.getMap("data").set("shared-key", "Alice value");
    });

    // Write a document on Charlie (should stay isolated)
    docCharlie.transact(() => {
      docCharlie.getMap("data").set("shared-key", "Charlie value"); // Concurrent conflict! Yjs will resolve it consistently.
      docCharlie.getMap("data").set("charlie-only", "Charlie unique");
    });

    await new Promise((r) => setTimeout(r, 80));

    // Verify Bob is synchronized with Alice, but Charlie remains completely unaffected
    const docBob = bob.sync.getDoc("todos");
    expect(docBob.getMap("data").get("shared-key")).toBe("Alice value");
    expect(docCharlie.getMap("data").get("shared-key")).toBe("Charlie value");

    // 2. Resolve network partitions (heal the mesh)
    router.setPartition("Alice", "Charlie", false);
    router.setPartition("Bob", "Charlie", false);

    // Wait for sync flushes to completely merge divergence
    await new Promise((r) => setTimeout(r, 150));

    // 3. Assert full, consistent CRDT synchronization across all three peers
    const stateAlice = docAlice.getMap("data").toJSON();
    const stateBob = docBob.getMap("data").toJSON();
    const stateCharlie = docCharlie.getMap("data").toJSON();

    expect(stateBob).toEqual(stateAlice);
    expect(stateCharlie).toEqual(stateAlice);
    expect(stateAlice["charlie-only"]).toBe("Charlie unique");
    expect(stateAlice["shared-key"]).toBeDefined(); // One of the values won consistently
  });

  it("should reach Strong Eventual Consistency after a peer goes offline and returns online", async () => {
    const alice = peers[0]!;
    const bob = peers[1]!;
    const charlie = peers[2]!;

    // 1. Bob goes offline completely
    router.setPeerOffline("Bob", true);

    const docAlice = alice.sync.getDoc("todos");
    const docCharlie = charlie.sync.getDoc("todos");

    // Alice writes an update
    docAlice.transact(() => {
      docAlice.getMap("data").set("item-a", "Alice update");
    });

    // Charlie writes an update
    docCharlie.transact(() => {
      docCharlie.getMap("data").set("item-c", "Charlie update");
    });

    await new Promise((r) => setTimeout(r, 80));

    // Verify Alice and Charlie are consistent, but Bob has no data
    expect(docCharlie.getMap("data").get("item-a")).toBe("Alice update");
    const docBob = bob.sync.getDoc("todos");
    expect(docBob.getMap("data").get("item-a")).toBeUndefined();

    // 2. Bob returns online
    router.setPeerOffline("Bob", false);

    // Wait for Bob's queue and network layers to sync
    await new Promise((r) => setTimeout(r, 150));

    // 3. Assert Bob has completely caught up and matched peers perfectly
    const stateAlice = docAlice.getMap("data").toJSON();
    const stateBob = docBob.getMap("data").toJSON();
    const stateCharlie = docCharlie.getMap("data").toJSON();

    expect(stateBob).toEqual(stateAlice);
    expect(stateCharlie).toEqual(stateAlice);
    expect(stateBob["item-a"]).toBe("Alice update");
    expect(stateBob["item-c"]).toBe("Charlie update");
  });

  it("should survive the P2P Chaos Monkey and eventually converge perfectly", async () => {
    const alice = peers[0]!;
    const bob = peers[1]!;
    const charlie = peers[2]!;

    const monkey = new P2PChaosMonkey(router, peerNames);

    // 1. Unleash the P2P Chaos Monkey
    monkey.start(25);

    const docAlice = alice.sync.getDoc("todos");
    const docBob = bob.sync.getDoc("todos");
    const docCharlie = charlie.sync.getDoc("todos");

    // Make concurrent chaotic modifications on all three peers
    for (let i = 0; i < 5; i++) {
      docAlice.transact(() => {
        docAlice.getMap("data").set(`alice-key-${i}`, `val-${i}`);
      });
      docBob.transact(() => {
        docBob.getMap("data").set(`bob-key-${i}`, `val-${i}`);
      });
      docCharlie.transact(() => {
        docCharlie.getMap("data").set(`charlie-key-${i}`, `val-${i}`);
      });
      await new Promise((r) => setTimeout(r, 15));
    }

    // Let the Chaos Monkey stress the nodes further while updates are pending
    await new Promise((r) => setTimeout(r, 100));

    // 2. Stop the P2P Chaos Monkey and restore network stability
    monkey.stop();

    // Wait for all outstanding queue mutations to converge
    await new Promise((r) => setTimeout(r, 200));

    // 3. Assert absolute Strong Eventual Consistency
    const stateAlice = docAlice.getMap("data").toJSON();
    const stateBob = docBob.getMap("data").toJSON();
    const stateCharlie = docCharlie.getMap("data").toJSON();

    expect(stateBob).toEqual(stateAlice);
    expect(stateCharlie).toEqual(stateAlice);

    // Verify all keys were eventually synchronized perfectly without data loss
    for (let i = 0; i < 5; i++) {
      expect(stateAlice[`alice-key-${i}`]).toBe(`val-${i}`);
      expect(stateAlice[`bob-key-${i}`]).toBe(`val-${i}`);
      expect(stateAlice[`charlie-key-${i}`]).toBe(`val-${i}`);
    }
  });
});
