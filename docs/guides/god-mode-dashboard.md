# Administrative "God Mode" Global Mesh Dashboard Guide

ZerithDB's standalone signaling server features a dedicated, high-fidelity administrative panel
known as **"God Mode"**. For self-hosters and enterprise developers, this console offers absolute,
real-time observability and absolute security controls over the global WebRTC mesh network
topography.

---

## Architecture Overview

The "God Mode" administration suite consists of three interconnected systems:

1. **REST / HTTP Endpoint Router (`/admin`, `/admin/login`, `/metrics`)**: Secure entry-point
   handling logins, token issuing, static single-page administration UI serving, and Prometheus
   exposition metrics scraping.
2. **Real-time Telemetry Stream (`/admin/ws`)**: A premium high-performance administrative WebSocket
   connection pushing real-time bandwidth metrics, room directories, mesh nodes topology, and global
   blocklists.
3. **Security Ban & Disrupt Center**: An enforcement system allowing administrators to disrupt
   active socket links and permanently ban malicious Peer IDs or IP addresses using robust,
   low-level socket handshaking interceptors.

---

## Configuration Variables

Configure administrative security and network endpoints by supplying the following environment
variables to the signaling server process:

| Environment Variable | Description                                       | Default Value                               |
| :------------------- | :------------------------------------------------ | :------------------------------------------ |
| `ADMIN_USER`         | Administrative dashboard login username           | `admin`                                     |
| `ADMIN_PASSWORD`     | Administrative dashboard login password           | `admin`                                     |
| `ADMIN_JWT_SECRET`   | Secret token signing key for admin authorization  | `zerith-godmode-admin-jwt-secret-key-12345` |
| `PORT`               | Bind port for signaling, HTTP APIs, and dashboard | `4000`                                      |
| `HOST`               | Bind host address for connection listening        | `0.0.0.0`                                   |

---

## Accessing the Admin Console

Once the signaling server starts up, self-hosters can access the dashboard by navigating their
browser to: `http://localhost:4000/admin` (or the corresponding server address).

### Dashboard Features

- **Midnight Cyberpunk Observability**: Stunning glassmorphic cards representing Uptime, Active Mesh
  Rooms count, Peers count, Bandwidth (Bytes) relays, and System integrity stats.
- **Dual Live Canvas Charts**: Zero-dependency high-frequency canvas drawing charts plotting Rx/Tx
  Bandwidth rates (Bytes/sec) and Inbound/Outbound Message Rates (msgs/sec) with smooth paths.
- **Global Active Mesh Topology**: Hierarchical and collapsible explorer mapping rooms, active
  transport channels (WebSockets vs. HTTP long-polling), peer IPs, and joint durations.
- **Disrupt Link Controls**: Administrative actions to abruptly disconnect a toxic peer.
- **Persistent Security Blocklists**: Absolute blocklisting of Peer IDs or IP addresses.
- **Live System Logs & Diagnostics**: Scrollable real-time administrative logs capturing credential
  checks, broadcasts, disconnections, and system alerts.

---

## Prometheus Metric Exposition

The signaling server exposes standard Prometheus-compatible text exposition metrics at:
`http://localhost:4000/metrics`

This endpoint can be scraped out-of-the-box by Prometheus and visualized in custom Grafana
dashboards.

### Mapped Metric Definitions

| Metric Name                                         | Type    | Description                                       |
| :-------------------------------------------------- | :------ | :------------------------------------------------ |
| `zerithdb_signaling_peers_active`                   | Gauge   | Currently connected peers in rooms                |
| `zerithdb_signaling_rooms_active`                   | Gauge   | Currently active rooms                            |
| `zerithdb_signaling_polling_sessions_active`        | Gauge   | Active HTTP long-polling sessions                 |
| `zerithdb_signaling_messages_received_total`        | Counter | Total messages received by server since bootstrap |
| `zerithdb_signaling_messages_sent_total`            | Counter | Total messages sent by server since bootstrap     |
| `zerithdb_signaling_bandwidth_bytes_received_total` | Counter | Cumulative bandwidth bytes received by server     |
| `zerithdb_signaling_bandwidth_bytes_sent_total`     | Counter | Cumulative bandwidth bytes sent by server         |
| `zerithdb_signaling_errors_total`                   | Counter | Total system errors logged since bootstrap        |
| `zerithdb_signaling_auth_failures_total`            | Counter | Total failed admin login attempts                 |
| `process_resident_memory_bytes`                     | Gauge   | Resident memory size (RSS) in bytes               |
| `process_uptime_seconds`                            | Counter | Signaling server process uptime in seconds        |

### Example Prometheus Configuration

```yaml
scrape_configs:
  - job_name: "zerithdb-signaling"
    scrape_interval: 5s
    static_configs:
      - targets: ["localhost:4000"]
```

---

## Client-Side Integration

Client node connections automatically handle incoming administrative broadcasts.

When an announcement is dispatched globally or target-specific from the God Mode panel,
`NetworkManager` intercepts the signaling payload and emits an `"announcement"` event that client
apps can bind to:

```typescript
import { NetworkManager } from "zerithdb-network";

const network = new NetworkManager({
  // options...
});

network.on("announcement", (message: string) => {
  console.warn("📢 Administrative Alert:", message);
  // Display modal alert or banner in client user interface
});
```
