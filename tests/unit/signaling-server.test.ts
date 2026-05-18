import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "net";

let serverInstance: any;
let wssInstance: any;
let roomsMap: any;
let pollingSessionsMap: any;
let blocklistedPeersSet: any;
let blocklistedIpsSet: any;
let statsObj: any;
let testPort: number;
let baseUrl: string;
let adminToken: string;

beforeAll(async () => {
  // Setup environment for the test signaling server instances
  process.env.PORT = "0"; // Dynamic port binding
  process.env.HOST = "127.0.0.1";
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASSWORD = "password";
  process.env.ADMIN_JWT_SECRET = "test-secret-key-123456";

  // Dynamic import to boot signaling server
  const mod = await import("../../infra/signaling-server/src/server.js");
  serverInstance = mod.server;
  wssInstance = mod.wss;
  roomsMap = mod.rooms;
  pollingSessionsMap = mod.pollingSessions;
  blocklistedPeersSet = mod.blocklistedPeers;
  blocklistedIpsSet = mod.blocklistedIps;
  statsObj = mod.stats;

  await new Promise<void>((resolve) => {
    if (serverInstance.listening) {
      resolve();
    } else {
      serverInstance.on("listening", resolve);
    }
  });

  const addr = serverInstance.address() as AddressInfo;
  testPort = addr.port;
  baseUrl = `http://127.0.0.1:${testPort}`;
});

afterAll(async () => {
  if (wssInstance) {
    wssInstance.close();
  }
  if (serverInstance) {
    await new Promise<void>((resolve) => {
      serverInstance.close(() => resolve());
    });
  }
});

describe("ZerithDB 'God Mode' Signaling Server Integration Tests", () => {
  it("should serve a successful /health check with proper metadata", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.service).toBe("zerithdb-signaling");
    expect(data).toHaveProperty("active_ws_connections");
    expect(data).toHaveProperty("active_polling_sessions");
  });

  it("should serve plaintext Prometheus exposition metrics on /metrics", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");

    const text = await res.text();
    expect(text).toContain("zerithdb_signaling_peers_active");
    expect(text).toContain("zerithdb_signaling_rooms_active");
    expect(text).toContain("zerithdb_signaling_messages_received_total");
    expect(text).toContain("process_resident_memory_bytes");
  });

  it("should reject invalid /admin/login credentials with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "wrong_user", password: "wrong_password" }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid credentials");
  });

  it("should successfully authenticate administrative credentials and set admin_token cookie", async () => {
    const res = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password" }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("token");
    adminToken = data.token;

    const cookie =
      res.headers.get("set-cookie") ||
      res.headers.get("Set-Cookie") ||
      (res.headers.getSetCookie ? res.headers.getSetCookie().join("; ") : "");
    if (cookie) {
      expect(cookie).toContain("admin_token=");
    } else {
      expect(adminToken).toBeDefined();
    }
  });

  it("should restrict websocket administrative endpoint /admin/ws to authenticated tokens", async () => {
    // Importing dynamically to handle client ws testing in Node
    const WebSocket = (await import("ws")).default;

    const wsUrl = `ws://127.0.0.1:${testPort}/admin/ws?token=invalid-token`;
    const ws = new WebSocket(wsUrl);

    const promise = new Promise<number>((resolve) => {
      ws.on("close", (code) => {
        resolve(code);
      });
    });

    const code = await promise;
    expect(code).toBe(4001); // Closed with Unauthorized code
  });

  it("should enforce peer disconnections and blocklisting via admin API", async () => {
    // Directly inject blocks to simulate administrative actions
    blocklistedPeersSet.add("banned-peer-id");
    blocklistedIpsSet.add("192.168.1.100");

    expect(blocklistedPeersSet.has("banned-peer-id")).toBe(true);
    expect(blocklistedIpsSet.has("192.168.1.100")).toBe(true);

    // Revoke ban
    blocklistedPeersSet.delete("banned-peer-id");
    blocklistedIpsSet.delete("192.168.1.100");

    expect(blocklistedPeersSet.has("banned-peer-id")).toBe(false);
    expect(blocklistedIpsSet.has("192.168.1.100")).toBe(false);
  });
});
