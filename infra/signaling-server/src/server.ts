import { WebSocketServer, WebSocket } from "ws";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { verify, sign, type JwtPayload } from "jsonwebtoken";
import * as crypto from "crypto";
import {
  registerStateProviders,
  recordPeerJoined,
  recordPeerLeft,
  recordMessageRelayed,
} from "./internal/metrics.js";
import { ADMIN_DASHBOARD_HTML } from "./internal/dashboard-html.js";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const JWT_SECRET = process.env["JWT_SECRET"] ?? "";

// Admin Settings
const ADMIN_USER = process.env["ADMIN_USER"] ?? "admin";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "admin";
const ADMIN_JWT_SECRET =
  process.env["ADMIN_JWT_SECRET"] ?? "zerith-godmode-admin-jwt-secret-key-12345";

type LogLevel = "debug" | "info" | "warn" | "error";

const validLogLevels: LogLevel[] = ["debug", "info", "warn", "error"];
const envLogLevel = process.env["LOG_LEVEL"];

const LOG_LEVEL: LogLevel =
  envLogLevel && validLogLevels.includes(envLogLevel as LogLevel)
    ? (envLogLevel as LogLevel)
    : "info";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[LOG_LEVEL];
};

const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog("info")) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog("error")) console.error(...args);
  },
};

const SERVER_START_TIME = Date.now();

// ─── Shared room state ──────────────────────────────────────────────────────

interface PeerEntry {
  peerId: string;
  ws?: WebSocket; // present for WebSocket peers
  sessionId?: string; // present for polling peers
  ip: string;
  joinedAt: number;
}

// roomId → Set of PeerEntry
const rooms = new Map<string, Set<PeerEntry>>();

// ─── Polling session state ──────────────────────────────────────────────────

interface PollingSession {
  sessionId: string;
  peerId: string;
  roomId: string;
  messageQueue: string[];
  /** Pending long-poll response waiting for messages */
  pendingResponse: ServerResponse | null;
  /** Timestamp of last activity (poll or send) */
  lastActivity: number;
}

// sessionId → PollingSession
const pollingSessions = new Map<string, PollingSession>();
const usedPowSolutions = new Map<string, number>();
const powChallengeRateLimiter = new FixedWindowRateLimiter(
  POW_CHALLENGE_RATE_LIMIT,
  POW_CHALLENGE_RATE_WINDOW_MS
);

/** How long a polling session can be inactive before cleanup (ms) */
const SESSION_TIMEOUT_MS = 60_000;

/** How long a single long-poll request blocks waiting for messages (ms) */
const LONG_POLL_TIMEOUT_MS = 30_000;

// Clean up expired sessions every 15 seconds
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of pollingSessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      cleanupPollingSession(sessionId, "timeout");
    }
  }
  cleanupUsedPowSolutions(now);
  powChallengeRateLimiter.cleanup(now);
}, 15_000);

// ─── JWT Auth ───────────────────────────────────────────────────────────────

function verifyRoomToken(token: string | null, roomId: string): string | null {
  if (!JWT_SECRET) return null;
  if (!token) return "Missing token";
  try {
    const payload = verify(token, JWT_SECRET) as JwtPayload;
    if (payload["roomId"] !== roomId) return "Token not valid for this room";
    return null;
  } catch {
    return "Invalid or expired token";
  }
}

// ─── Real-Time Statistics & Blocklists ─────────────────────────────────────

const blocklistedPeers = new Set<string>();
const blocklistedIps = new Set<string>();
const adminWebSockets = new Set<WebSocket>();
const adminLogs: Array<{ timestamp: string; message: string }> = [];

const stats = {
  totalMessagesReceived: 0,
  totalMessagesSent: 0,
  totalBandwidthBytesReceived: 0,
  totalBandwidthBytesSent: 0,
  totalConnectionsOpened: 0,
  totalConnectionsClosed: 0,
  totalErrors: 0,
  totalAuthFailures: 0,
  invalidMessagesReceived: 0,
};

function logAdminAction(message: string): void {
  adminLogs.unshift({
    timestamp: new Date().toISOString(),
    message,
  });
  if (adminLogs.length > 50) {
    adminLogs.pop();
  }
  notifyAdminTelemetry();
}

function getTelemetryData() {
  const roomList = [...rooms.entries()].map(([roomId, peerEntries]) => {
    return {
      roomId,
      peers: [...peerEntries].map((p) => ({
        peerId: p.peerId,
        transport: p.ws ? "ws" : "poll",
        ip: p.ip,
        joinedAt: p.joinedAt,
      })),
    };
  });

  return {
    uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    rooms: roomList,
    stats: { ...stats },
    blocklist: {
      peers: [...blocklistedPeers],
      ips: [...blocklistedIps],
    },
    logs: [...adminLogs],
  };
}

function notifyAdminTelemetry(): void {
  const serialized = JSON.stringify({
    type: "telemetry",
    payload: getTelemetryData(),
  });

  for (const adminWs of adminWebSockets) {
    if (adminWs.readyState === WebSocket.OPEN) {
      try {
        adminWs.send(serialized);
      } catch {
        adminWebSockets.delete(adminWs);
      }
    }
  }
}

// Automatically sync telemetries every 2 seconds to keep graphs alive
setInterval(() => {
  notifyAdminTelemetry();
}, 2000);

// Register OTel state providers
registerStateProviders({
  getRoomCount: () => rooms.size,
  getPeerCount: () => [...rooms.values()].reduce((acc, s) => acc + s.size, 0),
  getPollingSessionCount: () => pollingSessions.size,
});

// Prometheus Metrics Formatter
function getPrometheusMetrics(): string {
  const activePeers = [...rooms.values()].reduce((acc, s) => acc + s.size, 0);
  const activeRooms = rooms.size;
  const activePollSessions = pollingSessions.size;
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  const mem = process.memoryUsage();

  return `# HELP zerithdb_signaling_peers_active Number of currently connected peers
# TYPE zerithdb_signaling_peers_active gauge
zerithdb_signaling_peers_active ${activePeers}

# HELP zerithdb_signaling_rooms_active Number of currently active rooms
# TYPE zerithdb_signaling_rooms_active gauge
zerithdb_signaling_rooms_active ${activeRooms}

# HELP zerithdb_signaling_polling_sessions_active Number of currently active polling sessions
# TYPE zerithdb_signaling_polling_sessions_active gauge
zerithdb_signaling_polling_sessions_active ${activePollSessions}

# HELP zerithdb_signaling_messages_received_total Total messages received by the signaling server
# TYPE zerithdb_signaling_messages_received_total counter
zerithdb_signaling_messages_received_total ${stats.totalMessagesReceived}

# HELP zerithdb_signaling_messages_sent_total Total messages sent by the signaling server
# TYPE zerithdb_signaling_messages_sent_total counter
zerithdb_signaling_messages_sent_total ${stats.totalMessagesSent}

# HELP zerithdb_signaling_bandwidth_bytes_received_total Total bandwidth bytes received
# TYPE zerithdb_signaling_bandwidth_bytes_received_total counter
zerithdb_signaling_bandwidth_bytes_received_total ${stats.totalBandwidthBytesReceived}

# HELP zerithdb_signaling_bandwidth_bytes_sent_total Total bandwidth bytes sent
# TYPE zerithdb_signaling_bandwidth_bytes_sent_total counter
zerithdb_signaling_bandwidth_bytes_sent_total ${stats.totalBandwidthBytesSent}

# HELP zerithdb_signaling_connections_opened_total Total connection attempts opened
# TYPE zerithdb_signaling_connections_opened_total counter
zerithdb_signaling_connections_opened_total ${stats.totalConnectionsOpened}

# HELP zerithdb_signaling_connections_closed_total Total connection closed
# TYPE zerithdb_signaling_connections_closed_total counter
zerithdb_signaling_connections_closed_total ${stats.totalConnectionsClosed}

# HELP zerithdb_signaling_errors_total Total errors encountered
# TYPE zerithdb_signaling_errors_total counter
zerithdb_signaling_errors_total ${stats.totalErrors}

# HELP zerithdb_signaling_auth_failures_total Total authentication failures encountered
# TYPE zerithdb_signaling_auth_failures_total counter
zerithdb_signaling_auth_failures_total ${stats.totalAuthFailures}

# HELP process_resident_memory_bytes Resident memory size in bytes
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes ${mem.rss}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds counter
process_uptime_seconds ${uptimeSeconds}
`;
}

// Administrative Action Handlers
function broadcastAnnouncement(message: string, targetRoomId?: string): void {
  const packet = {
    type: "announcement",
    from: "server",
    payload: message,
  };

  const serialized = JSON.stringify(packet);

  if (targetRoomId) {
    const room = rooms.get(targetRoomId);
    if (room) {
      for (const peer of room) {
        deliverToPeer(peer, serialized);
      }
    }
  } else {
    for (const room of rooms.values()) {
      for (const peer of room) {
        deliverToPeer(peer, serialized);
      }
    }
  }
}

function forceDisconnectPeer(peerId: string): boolean {
  let disconnected = false;

  // 1. Search in polling sessions
  for (const [sessionId, session] of pollingSessions.entries()) {
    if (session.peerId === peerId) {
      cleanupPollingSession(sessionId, "error");
      disconnected = true;
    }
  }

  // 2. Search in rooms
  for (const [roomId, room] of rooms.entries()) {
    for (const peer of room) {
      if (peer.peerId === peerId) {
        if (peer.ws) {
          try {
            peer.ws.close(4000, "Forcefully disconnected by administrator");
          } catch {
            // Ignore
          }
          disconnected = true;
        }
        room.delete(peer);
      }
    }
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  notifyAdminTelemetry();
  return disconnected;
}

function banPeer(peerId: string, ipToBan?: string): void {
  blocklistedPeers.add(peerId);
  if (ipToBan && ipToBan !== "unknown") {
    blocklistedIps.add(ipToBan);
  }

  // Disconnect target peer
  forceDisconnectPeer(peerId);

  // If IP banned, disconnect any other peers on the same IP
  if (ipToBan && ipToBan !== "unknown") {
    for (const [roomId, room] of rooms.entries()) {
      for (const peer of room) {
        if (peer.ip === ipToBan) {
          if (peer.ws) {
            try {
              peer.ws.close(4003, "IP banned by administrator");
            } catch {
              // Ignore
            }
          } else if (peer.sessionId) {
            cleanupPollingSession(peer.sessionId, "error");
          }
          room.delete(peer);
        }
      }
      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }
  }

  notifyAdminTelemetry();
}

// ─── HTTP server ────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  // Serve "God Mode" dashboard
  if (pathname === "/admin" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(ADMIN_DASHBOARD_HTML);
    return;
  }

  // Admin login API
  if (pathname === "/admin/login" && req.method === "POST") {
    readJsonBody(req, (err, body) => {
      if (err || !body?.username || !body?.password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing username or password" }));
        stats.totalErrors++;
        return;
      }

      if (body.username === ADMIN_USER && body.password === ADMIN_PASSWORD) {
        const token = sign({ role: "admin" }, ADMIN_JWT_SECRET, { expiresIn: "24h" });

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `admin_token=${token}; Path=/; HttpOnly; Max-Age=86400`,
        });
        res.end(JSON.stringify({ token }));
        logAdminAction(`Successfully authenticated administrative user '${ADMIN_USER}'`);
      } else {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid credentials" }));
        stats.totalAuthFailures++;
        stats.totalErrors++;
      }
    });
    return;
  }

  // Prometheus scrape endpoint
  if (pathname === "/metrics" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(getPrometheusMetrics());
    return;
  }

  // Health check (existing behavior)
  if ((pathname === "/" || pathname === "/health") && req.method === "GET") {
    const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "zerithdb-signaling",
        version: "0.1.0",
        uptime_seconds: uptimeSeconds,
        active_ws_connections: wss.clients.size - adminWebSockets.size,
        active_polling_sessions: pollingSessions.size,
        rooms: rooms.size,
        peers: [...rooms.values()].reduce((acc, s) => acc + s.size, 0),
        pow: {
          enabled: POW_ENABLED,
          algorithm: "hashcash-sha256",
          difficulty: getCurrentPowDifficulty(),
        },
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // ─── Long-polling endpoints ───────────────────────────────────────────

  if (pathname === "/pow/challenge" && req.method === "GET") {
    handlePowChallenge(req, url, res);
    return;
  }

  if (pathname === "/poll/join" && req.method === "POST") {
    handlePollJoin(req, res);
    return;
  }

  if (pathname === "/poll/messages" && req.method === "GET") {
    handlePollMessages(url, res);
    return;
  }

  if (pathname === "/poll/send" && req.method === "POST") {
    handlePollSend(req, res);
    return;
  }

  if (pathname === "/poll/leave" && req.method === "POST") {
    handlePollLeave(req, res);
    return;
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ─── WebSocket server ───────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  // Route Admin Telemetry WS Connection
  if (pathname === "/admin/ws" || pathname === "/admin/telemetry") {
    handleAdminWs(ws, req);
    return;
  }

  const roomId = url.searchParams.get("room");
  const peerId = url.searchParams.get("peer");
  const token: string | null = url.searchParams.get("token");
  const clientIp = req.socket.remoteAddress ?? "unknown";

  // Check Blocklists
  if (peerId && blocklistedPeers.has(peerId)) {
    logger.warn(`[!] Rejected blocked peer=${peerId} connection attempt`);
    ws.close(4003, "Peer is banned by administrator");
    stats.totalErrors++;
    return;
  }

  if (clientIp !== "unknown" && blocklistedIps.has(clientIp)) {
    logger.warn(`[!] Rejected blocked IP=${clientIp} connection attempt`);
    ws.close(4003, "IP is banned by administrator");
    stats.totalErrors++;
    return;
  }

  if (!roomId || !peerId) {
    logger.warn(`[!] Rejected connection from ${req.socket.remoteAddress}: missing params`);
    ws.close(1008, "Missing room or peer query parameters");
    stats.totalErrors++;
    return;
  }

  const authError = verifyRoomToken(token, roomId);
  if (authError) {
    console.log(`[!] Rejected connection from peer=${peerId}: ${authError}`);
    ws.close(1008, authError);
    stats.totalAuthFailures++;
    stats.totalErrors++;
    return;
  }

  const powError = verifyRequestPow({ challenge: powChallenge, nonce: powNonce }, roomId, peerId);
  if (powError) {
    logger.warn(`[!] Rejected connection from peer=${peerId}: ${powError}`);
    ws.close(1008, powError);
    return;
  }

  // Ensure room exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const room = rooms.get(roomId)!;

  // Add peer to room
  const peerEntry: PeerEntry = {
    peerId,
    ws,
    ip: clientIp,
    joinedAt: Date.now(),
  };
  room.add(peerEntry);

  stats.totalConnectionsOpened++;
  recordPeerJoined("ws");
  notifyAdminTelemetry();

  logger.info(`[+] peer=${peerId} joined room=${roomId} (room size: ${room.size})`);
  logger.info(`[+] peer=${peerId} joined room=${roomId} via WebSocket (room size: ${room.size})`);

  // Send the new peer the list of existing peers
  const existingPeerIds = [...room].filter((p) => p.peerId !== peerId).map((p) => p.peerId);

  ws.send(JSON.stringify({ type: "peer-list", from: "server", payload: existingPeerIds }));

  // Relay messages between peers
  ws.on("message", (data) => {
    logger.debug(`[MESSAGE] peer=${peerId} room=${roomId}`);

    // Track metrics
    const bytes = data.toString().length;
    stats.totalMessagesReceived++;
    stats.totalBandwidthBytesReceived += bytes;

    let msg: { to?: string; from?: string; [key: string]: unknown };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      logger.warn(`[!] Invalid message from peer=${peerId}`);
      stats.invalidMessagesReceived++;
      stats.totalErrors++;
      return;
    }

    // Stamp the sender
    msg.from = peerId;

    relayMessage(roomId, peerId, msg, "ws");
  });

  ws.on("close", (code) => {
    room.delete(peerEntry);
    logger.info(`[-] peer=${peerId} left room=${roomId} (room size: ${room.size})`);

    stats.totalConnectionsClosed++;
    const isGraceful = code === 1000 || code === 1001 || code === 1005;
    recordPeerLeft("ws", isGraceful ? "graceful" : "error");
    notifyAdminTelemetry();

    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
    } else {
      // Notify remaining peers
      broadcastToRoom(roomId, peerId, {
        type: "peer-left",
        from: "server",
        payload: peerId,
      });
    }
  });

  ws.on("error", (err) => {
    logger.error(`[!] peer=${peerId} error=${err.message}`);
    room.delete(peerEntry);
    stats.totalErrors++;
  });
});

// Admin WebSocket Telemetry logic
function handleAdminWs(ws: WebSocket, req: IncomingMessage): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");

  // Extract token from cookies
  let cookieToken = "";
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader.match(/admin_token=([^;]+)/);
  if (match) {
    cookieToken = match[1];
  }

  const finalToken = token ?? cookieToken;

  try {
    if (!finalToken) throw new Error("Missing credentials");
    const payload = verify(finalToken, ADMIN_JWT_SECRET) as JwtPayload;
    if (payload.role !== "admin") throw new Error("Unauthorized role");
  } catch (err) {
    ws.close(4001, "Unauthorized Admin Access");
    return;
  }

  adminWebSockets.add(ws);

  // Deliver initial live state
  ws.send(
    JSON.stringify({
      type: "telemetry",
      payload: getTelemetryData(),
    })
  );

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleAdminCommand(msg, ws);
    } catch {
      // Ignore malformed commands
    }
  });

  ws.on("close", () => {
    adminWebSockets.delete(ws);
  });

  ws.on("error", () => {
    adminWebSockets.delete(ws);
  });
}

function handleAdminCommand(msg: any, ws: WebSocket): void {
  const { type, payload } = msg;

  switch (type) {
    case "broadcast":
      if (payload && typeof payload.message === "string") {
        broadcastAnnouncement(payload.message, payload.roomId);
        logAdminAction(
          `Broadcast announcement: "${payload.message}"` +
            (payload.roomId ? ` to room ${payload.roomId}` : " globally")
        );
      }
      break;

    case "disconnect":
      if (payload && typeof payload.peerId === "string") {
        const success = forceDisconnectPeer(payload.peerId);
        if (success) {
          logAdminAction(`Force disconnected peer: ${payload.peerId}`);
        }
      }
      break;

    case "ban":
      if (payload && typeof payload.peerId === "string") {
        let peerIp: string | undefined;
        for (const room of rooms.values()) {
          for (const peer of room) {
            if (peer.peerId === payload.peerId) {
              peerIp = peer.ip;
              break;
            }
          }
        }

        banPeer(payload.peerId, payload.banIp ? peerIp : undefined);
        logAdminAction(
          `Banned peer: ${payload.peerId}` + (payload.banIp && peerIp ? ` and IP: ${peerIp}` : "")
        );
      }
      break;

    case "unban":
      if (payload && typeof payload.value === "string") {
        if (payload.type === "peer") {
          blocklistedPeers.delete(payload.value);
          logAdminAction(`Unbanned peer: ${payload.value}`);
        } else if (payload.type === "ip") {
          blocklistedIps.delete(payload.value);
          logAdminAction(`Unbanned IP: ${payload.value}`);
        }
        notifyAdminTelemetry();
      }
      break;
  }
}

// ─── Shared relay logic ─────────────────────────────────────────────────────

/**
 * Relay a signaling message within a room.
 * Handles both unicast (msg.to is set) and broadcast.
 * Delivers to both WebSocket and polling peers.
 */
function relayMessage(
  roomId: string,
  senderPeerId: string,
  msg: { to?: string; from?: string; [key: string]: unknown },
  senderTransport: "ws" | "poll"
): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const serialized = JSON.stringify(msg);
  const isUnicast = msg.to !== undefined;

  if (isUnicast) {
    logger.debug(`[UNICAST] from=${senderPeerId} to=${msg.to ?? "unknown"}`);
    for (const peer of room) {
      if (peer.peerId === msg.to) {
        deliverToPeer(peer, serialized);
        recordMessageRelayed("unicast", senderTransport);
        break;
      }
    }
  } else {
    logger.debug(`[BROADCAST] from=${senderPeerId} room=${roomId}`);
    for (const peer of room) {
      if (peer.peerId !== senderPeerId) {
        deliverToPeer(peer, serialized);
        recordMessageRelayed("broadcast", senderTransport);
      }
    }
  }
}

/**
 * Broadcast a server-originated message to all peers in a room except one.
 */
function broadcastToRoom(
  roomId: string,
  excludePeerId: string,
  msg: Record<string, unknown>
): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const serialized = JSON.stringify(msg);
  for (const peer of room) {
    if (peer.peerId !== excludePeerId) {
      deliverToPeer(peer, serialized);
    }
  }
}

/**
 * Deliver a serialized message to a peer, whether WebSocket or polling.
 */
function deliverToPeer(peer: PeerEntry, serialized: string): void {
  const bytes = serialized.length;
  if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
    try {
      peer.ws.send(serialized);
      stats.totalMessagesSent++;
      stats.totalBandwidthBytesSent += bytes;
    } catch {
      stats.totalErrors++;
    }
  } else if (peer.sessionId) {
    const session = pollingSessions.get(peer.sessionId);
    if (session) {
      enqueuePollingMessage(session, serialized);
      stats.totalMessagesSent++;
      stats.totalBandwidthBytesSent += bytes;
    }
  }
}

// ─── Polling endpoint handlers ──────────────────────────────────────────────

/**
 * POST /poll/join
 * Body: { room: string, peer: string }
 * Response: { sessionId: string, peerList: string[] }
 */
function handlePollJoin(req: IncomingMessage, res: ServerResponse): void {
  readJsonBody(req, (err, body: { room?: string; peer?: string; token?: string } | null) => {
    if (err || !body?.room || !body?.peer) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing room or peer" }));
      stats.totalErrors++;
      return;
    }

    const clientIp = req.socket.remoteAddress ?? "unknown";

    // Check Blocklists
    if (blocklistedPeers.has(body.peer)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Peer is banned by administrator" }));
      stats.totalErrors++;
      return;
    }

    if (clientIp !== "unknown" && blocklistedIps.has(clientIp)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "IP is banned by administrator" }));
      stats.totalErrors++;
      return;
    }

    const authError = verifyRoomToken(body.token ?? null, body.room);
    if (authError) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: authError }));
      stats.totalAuthFailures++;
      stats.totalErrors++;
      return;
    }

    const { room: roomId, peer: peerId } = body;
    const sessionId = crypto.randomUUID();

    // Ensure room exists
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    const room = rooms.get(roomId)!;

    // Build peer list BEFORE adding this peer
    const peerList = [...room].filter((p) => p.peerId !== peerId).map((p) => p.peerId);

    // Create session
    const session: PollingSession = {
      sessionId,
      peerId,
      roomId,
      messageQueue: [],
      pendingResponse: null,
      lastActivity: Date.now(),
    };
    pollingSessions.set(sessionId, session);

    // Add peer to room
    const peerEntry: PeerEntry = {
      peerId,
      sessionId,
      ip: clientIp,
      joinedAt: Date.now(),
    };
    room.add(peerEntry);

    stats.totalConnectionsOpened++;
    recordPeerJoined("poll");
    notifyAdminTelemetry();

    console.log(
      `[+] peer=${peerId} joined room=${roomId} via HTTP polling ` +
        `(session=${sessionId.slice(0, 8)}…, room size: ${room.size})`
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId, peerList }));
  });
}

/**
 * GET /poll/messages?session=<id>&room=<room>
 * Long-polls for up to 30 seconds. Returns immediately if messages are queued.
 * Response: { messages: string[] }
 */
function handlePollMessages(url: URL, res: ServerResponse): void {
  const sessionId = url.searchParams.get("session");
  const roomId = url.searchParams.get("room");

  if (!sessionId || !roomId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing session or room" }));
    stats.totalErrors++;
    return;
  }

  const session = pollingSessions.get(sessionId);
  if (!session || session.roomId !== roomId) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    stats.totalErrors++;
    return;
  }

  session.lastActivity = Date.now();

  // If there are queued messages, return them immediately
  if (session.messageQueue.length > 0) {
    const messages = session.messageQueue.splice(0);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages }));
    return;
  }

  // Otherwise, hold the connection open until a message arrives or timeout
  session.pendingResponse = res;

  const timer = setTimeout(() => {
    if (session.pendingResponse === res) {
      session.pendingResponse = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ messages: [] }));
    }
  }, LONG_POLL_TIMEOUT_MS);

  // Clean up if the client disconnects while waiting
  res.on("close", () => {
    clearTimeout(timer);
    if (session.pendingResponse === res) {
      session.pendingResponse = null;
    }
  });
}

/**
 * POST /poll/send
 * Body: { session: string, room: string, message: object }
 * Relays the message to other peers in the room.
 */
function handlePollSend(req: IncomingMessage, res: ServerResponse): void {
  readJsonBody(req, (err, body: { session?: string; room?: string; message?: any } | null) => {
    if (err || !body?.session || !body?.room || !body?.message) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing session, room, or message" }));
      stats.totalErrors++;
      return;
    }

    const session = pollingSessions.get(body.session);
    if (!session || session.roomId !== body.room) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      stats.totalErrors++;
      return;
    }

    session.lastActivity = Date.now();

    // Track metrics
    const bytes = JSON.stringify(body.message).length;
    stats.totalMessagesReceived++;
    stats.totalBandwidthBytesReceived += bytes;

    // Stamp the sender
    const msg = body.message;
    msg.from = session.peerId;

    relayMessage(body.room, session.peerId, msg, "poll");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
}

/**
 * POST /poll/leave
 * Body: { session: string, room: string }
 * Graceful departure — cleans up immediately.
 */
function handlePollLeave(req: IncomingMessage, res: ServerResponse): void {
  readJsonBody(req, (err, body: { session?: string; room?: string } | null) => {
    if (err || !body?.session || !body?.room) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing session or room" }));
      stats.totalErrors++;
      return;
    }

    cleanupPollingSession(body.session, "graceful");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
}

// ─── Polling helpers ────────────────────────────────────────────────────────

/**
 * Enqueue a message for a polling session.
 * If there's a pending long-poll response, flush immediately.
 */
function enqueuePollingMessage(session: PollingSession, serialized: string): void {
  if (session.pendingResponse !== null) {
    // Long-poll is waiting — respond immediately with this message
    const res = session.pendingResponse;
    session.pendingResponse = null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages: [serialized] }));
  } else {
    // Queue for next poll
    session.messageQueue.push(serialized);
  }
}

/**
 * Clean up a polling session: remove from room, notify peers, delete state.
 */
function cleanupPollingSession(
  sessionId: string,
  reason: "graceful" | "timeout" | "error" = "timeout"
): void {
  const session = pollingSessions.get(sessionId);
  if (!session) return;

  const { peerId, roomId } = session;

  // Cancel any pending long-poll response
  if (session.pendingResponse !== null) {
    try {
      session.pendingResponse.writeHead(410, { "Content-Type": "application/json" });
      session.pendingResponse.end(JSON.stringify({ error: "Session expired" }));
    } catch {
      // Response may already be closed
    }
    session.pendingResponse = null;
  }

  // Remove peer from room
  const room = rooms.get(roomId);
  if (room) {
    for (const entry of room) {
      if (entry.sessionId === sessionId) {
        room.delete(entry);
        break;
      }
    }

    if (room.size === 0) {
      rooms.delete(roomId);
    } else {
      broadcastToRoom(roomId, peerId, {
        type: "peer-left",
        from: "server",
        payload: peerId,
      });
    }
  }

  pollingSessions.delete(sessionId);
  stats.totalConnectionsClosed++;

  const oTelReason =
    reason === "timeout" ? "timeout" : reason === "graceful" ? "graceful" : "error";
  recordPeerLeft("poll", oTelReason);
  notifyAdminTelemetry();

  console.log(
    `[-] peer=${peerId} left room=${roomId} via session cleanup (reason: ${reason}) ` +
      `(session=${sessionId.slice(0, 8)}…)`
  );
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function handlePowChallenge(req: IncomingMessage, url: URL, res: ServerResponse): void {
  const room = url.searchParams.get("room");
  const peer = url.searchParams.get("peer");

  if (!room || !peer) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing room or peer" }));
    return;
  }

  if (!POW_ENABLED) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ required: false }));
    return;
  }

  if (!powChallengeRateLimiter.check(getPowRateLimitKey(req))) {
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "Too many proof-of-work challenges" }));
    return;
  }

  const challenge = createPowChallenge({
    room,
    peer,
    difficulty: getCurrentPowDifficulty(),
    secret: POW_SECRET,
    ttlMs: POW_CHALLENGE_TTL_MS,
  });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ required: true, ...challenge }));
}

function verifyRequestPow(
  solution: PowSolutionInput | null | undefined,
  room: string,
  peer: string
): string | null {
  if (!POW_ENABLED) return null;

  const result = verifyPowSolution({
    solution,
    room,
    peer,
    secret: POW_SECRET,
    markUsed: markPowSolutionUsed,
  });

  return result.ok ? null : (result.error ?? "Invalid proof-of-work solution");
}

function getCurrentPowDifficulty(): number {
  return calculatePowDifficulty({
    baseDifficulty: POW_BASE_DIFFICULTY,
    maxDifficulty: POW_MAX_DIFFICULTY,
    loadStep: POW_LOAD_STEP,
    activePeers: [...rooms.values()].reduce((acc, s) => acc + s.size, 0),
    threatLevel: POW_THREAT_LEVEL,
  });
}

function markPowSolutionUsed(key: string, expiresAt: number): boolean {
  cleanupUsedPowSolutions(Date.now());
  if (usedPowSolutions.has(key)) return false;
  usedPowSolutions.set(key, expiresAt);
  return true;
}

function cleanupUsedPowSolutions(now: number): void {
  for (const [key, expiresAt] of usedPowSolutions) {
    if (expiresAt < now) {
      usedPowSolutions.delete(key);
    }
  }
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPowRateLimitKey(req: IncomingMessage): string {
  if (POW_TRUST_X_FORWARDED_FOR) {
    const forwardedFor = req.headers["x-forwarded-for"];
    const firstForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const clientIp = firstForwardedFor?.split(",")[0]?.trim();
    if (clientIp) return clientIp;
  }

  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Read and parse a JSON request body.
 */
function readJsonBody(req: IncomingMessage, cb: (err: Error | null, body: any) => void): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      cb(null, body);
    } catch (e) {
      cb(e as Error, null);
    }
  });
  req.on("error", (err) => cb(err, null));
}

// ─── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  logger.info(`🚀 ZerithDB Signaling Server running at ws://${HOST}:${PORT}`);
  logger.info(`   HTTP health check: http://${HOST}:${PORT}`);
  logger.info(`   HTTP long-polling: http://${HOST}:${PORT}/poll/*`);
  logger.info(`   God Mode Dashboard: http://${HOST}:${PORT}/admin`);
  logger.info(`   Prometheus endpoint: http://${HOST}:${PORT}/metrics`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Shutting down signaling server...");
  // Clean up all polling sessions
  for (const [sessionId] of pollingSessions) {
    cleanupPollingSession(sessionId, "error");
  }
  wss.close(() => server.close(() => process.exit(0)));
});

export {
  server,
  wss,
  rooms,
  pollingSessions,
  blocklistedPeers,
  blocklistedIps,
  stats,
  getTelemetryData,
  getPrometheusMetrics,
  broadcastAnnouncement,
  forceDisconnectPeer,
  banPeer,
};
