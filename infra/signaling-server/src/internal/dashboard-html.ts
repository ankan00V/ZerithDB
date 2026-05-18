/**
 * @internal
 * HTML, CSS and JS for the "God Mode" Global Mesh Dashboard.
 * Inlined as a TS module to guarantee seamless bundling by esbuild.
 */
export const ADMIN_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZerithDB | "God Mode" Global Mesh Dashboard</title>
  <!-- Google Fonts Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-primary: #090d16;
      --bg-secondary: #0f172a;
      --bg-card: rgba(30, 41, 59, 0.4);
      --border-color: rgba(255, 255, 255, 0.08);
      --accent-primary: #6366f1;
      --accent-secondary: #a855f7;
      --accent-gradient: linear-gradient(135deg, #6366f1, #a855f7);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --glow-color: rgba(99, 102, 241, 0.15);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      overflow-x: hidden;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--accent-primary);
    }

    /* Glassmorphism Classes */
    .glass-panel {
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .glass-panel:hover {
      border-color: rgba(99, 102, 241, 0.25);
      box-shadow: 0 12px 40px 0 rgba(99, 102, 241, 0.08);
    }

    /* Auth Screen styling */
    #auth-screen {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at center, #1e1b4b 0%, #090d16 100%);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.5s ease, visibility 0.5s;
    }

    #auth-screen.hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .login-card {
      width: 100%;
      max-width: 420px;
      padding: 40px;
      text-align: center;
    }

    .logo-container {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: var(--accent-gradient);
      margin-bottom: 24px;
      box-shadow: 0 0 20px var(--glow-color);
    }

    .logo-container svg {
      width: 32px;
      height: 32px;
      fill: white;
    }

    .login-card h2 {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
      background: var(--accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .login-card p {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 32px;
    }

    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .form-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }

    .form-input:focus {
      border-color: var(--accent-primary);
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
    }

    .btn {
      width: 100%;
      background: var(--accent-gradient);
      border: none;
      border-radius: 8px;
      padding: 14px;
      color: white;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
    }

    .btn:active {
      transform: translateY(1px);
    }

    .error-msg {
      color: var(--danger);
      font-size: 13px;
      margin-top: 16px;
      display: none;
    }

    /* Main Dashboard View */
    #dashboard-view {
      display: flex;
      flex-direction: column;
      flex: 1;
      padding: 24px;
      max-width: 1600px;
      margin: 0 auto;
      width: 100%;
      gap: 24px;
    }

    /* Header styling */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-logo {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--accent-gradient);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 12px var(--glow-color);
    }

    .brand-logo svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .brand h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }

    .brand h1 span {
      background: var(--accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-left: 4px;
    }

    .system-status {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-color);
      font-size: 13px;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite;
    }

    .status-dot.disconnected {
      background: var(--danger);
      box-shadow: 0 0 8px var(--danger);
      animation: none;
    }

    .logout-btn {
      background: transparent;
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      color: var(--danger);
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .logout-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: var(--danger);
    }

    /* KPI Summary Cards Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
    }

    .kpi-card {
      padding: 24px;
      position: relative;
      overflow: hidden;
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: var(--accent-gradient);
    }

    .kpi-card.warning::before {
      background: var(--warning);
    }

    .kpi-card.danger::before {
      background: var(--danger);
    }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .kpi-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-primary);
    }

    .kpi-card.warning .kpi-icon { color: var(--warning); }
    .kpi-card.danger .kpi-icon { color: var(--danger); }

    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -1px;
      font-variant-numeric: tabular-nums;
    }

    .kpi-desc {
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Telemetry Charts Section */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 24px;
    }

    .chart-panel {
      padding: 24px;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    .panel-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .panel-title svg {
      color: var(--accent-primary);
      width: 18px;
      height: 18px;
    }

    .canvas-container {
      position: relative;
      flex: 1;
      height: 180px;
      width: 100%;
    }

    canvas {
      width: 100% !important;
      height: 100% !important;
    }

    /* Three Columns Control Hub */
    .dashboard-layout {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
    }

    @media (max-width: 1200px) {
      .dashboard-layout {
        grid-template-columns: 1fr;
      }
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }

    .column-panel {
      padding: 24px;
      display: flex;
      flex-direction: column;
      max-height: 600px;
    }

    .scroll-container {
      flex: 1;
      overflow-y: auto;
      margin-top: 12px;
      padding-right: 4px;
    }

    /* Broadcast panel specific */
    .form-row {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .select-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text-primary);
      font-family: inherit;
      outline: none;
    }

    .textarea-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
      outline: none;
      resize: none;
      height: 90px;
      transition: border 0.2s;
    }

    .textarea-input:focus {
      border-color: var(--accent-primary);
    }

    /* Mesh Topology / Active Rooms visualizer */
    .search-bar {
      margin-bottom: 16px;
    }

    .room-item {
      border: 1px solid var(--border-color);
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.2);
      margin-bottom: 12px;
      overflow: hidden;
      transition: all 0.2s;
    }

    .room-header {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      background: rgba(255, 255, 255, 0.02);
    }

    .room-header:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .room-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .room-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--accent-gradient);
      color: white;
    }

    .room-name {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.2px;
      font-family: 'JetBrains Mono', monospace;
    }

    .peer-count-badge {
      font-size: 12px;
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 2px 8px;
      font-weight: 500;
    }

    .room-peers-list {
      border-top: 1px solid var(--border-color);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .peer-card {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .peer-meta {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .peer-meta span b {
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
    }

    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .badge.ws { background: rgba(99, 102, 241, 0.2); color: #818cf8; }
    .badge.poll { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }

    .peer-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .btn-sm {
      flex: 1;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.2s;
    }

    .btn-sm.disconnect {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .btn-sm.disconnect:hover {
      background: var(--danger);
      color: white;
    }

    .btn-sm.ban {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.2);
    }

    .btn-sm.ban:hover {
      background: var(--warning);
      color: black;
    }

    /* Ban and Security List */
    .ban-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: rgba(239, 68, 68, 0.05);
      border: 1px dashed rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .ban-val {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }

    .revoke-ban-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      transition: color 0.2s;
    }

    .revoke-ban-btn:hover {
      color: var(--danger);
    }

    /* Audit Logs */
    .log-panel {
      padding: 24px;
      display: flex;
      flex-direction: column;
      height: 250px;
    }

    .log-list {
      flex: 1;
      overflow-y: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .log-entry {
      line-height: 1.5;
      padding: 4px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.01);
    }

    .log-time {
      color: var(--text-muted);
      margin-right: 8px;
    }

    .log-text {
      color: #e2e8f0;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 13px;
    }

    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; transform: scale(1.1); }
      100% { opacity: 0.6; }
    }
  </style>
</head>
<body>

  <!-- AUTH SCREEN -->
  <div id="auth-screen">
    <div class="login-card glass-panel">
      <div class="logo-container">
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
        </svg>
      </div>
      <h2>ZerithDB <span>"God Mode"</span></h2>
      <p>Administrative Network Management Console</p>
      
      <form id="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" class="form-input" placeholder="admin" required autocomplete="username">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn">
          <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          Authenticate Control
        </button>
        <div id="login-error" class="error-msg">Invalid administrative credentials.</div>
      </form>
    </div>
  </div>

  <!-- DASHBOARD MAIN VIEW -->
  <div id="dashboard-view">
    <header>
      <div class="brand">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
          </svg>
        </div>
        <h1>ZerithDB | <span>God Mode</span></h1>
      </div>
      
      <div class="system-status">
        <div class="status-indicator">
          <div id="ws-status-dot" class="status-dot disconnected"></div>
          <span id="ws-status-text">Telemetry: Offline</span>
        </div>
        <button class="logout-btn" onclick="logout()">Terminate Admin Session</button>
      </div>
    </header>

    <!-- KPI GRID -->
    <div class="kpi-grid">
      <div class="kpi-card glass-panel">
        <div class="kpi-header">
          <span>Server Uptime</span>
          <div class="kpi-icon">🕒</div>
        </div>
        <div id="uptime-val" class="kpi-value">00:00:00</div>
        <div class="kpi-desc">Time since service bootstrap</div>
      </div>
      
      <div class="kpi-card glass-panel">
        <div class="kpi-header">
          <span>Mesh Population</span>
          <div class="kpi-icon">👥</div>
        </div>
        <div id="mesh-population" class="kpi-value">0 Rooms / 0 Peers</div>
        <div class="kpi-desc">Currently active mesh state</div>
      </div>
      
      <div class="kpi-card glass-panel warning">
        <div class="kpi-header">
          <span>Bandwidth Transferred</span>
          <div class="kpi-icon">⚡</div>
        </div>
        <div id="bandwidth-val" class="kpi-value">0.00 MB</div>
        <div class="kpi-desc">Total relayed payload size</div>
      </div>
      
      <div class="kpi-card glass-panel danger">
        <div class="kpi-header">
          <span>System Integrity</span>
          <div class="kpi-icon">🛡️</div>
        </div>
        <div id="integrity-val" class="kpi-value">100%</div>
        <div id="integrity-desc" class="kpi-desc">0 Errors / 0 Auth Failures</div>
      </div>
    </div>

    <!-- CHARTS GRID -->
    <div class="charts-grid">
      <div class="chart-panel glass-panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg style="width:16px;height:16px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Live Bandwidth Telemetry (Bytes/sec)
          </div>
        </div>
        <div class="canvas-container">
          <canvas id="bandwidth-chart"></canvas>
        </div>
      </div>

      <div class="chart-panel glass-panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg style="width:16px;height:16px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
            Message Exchange Frequency (msgs/sec)
          </div>
        </div>
        <div class="canvas-container">
          <canvas id="messages-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- DOUBLE COLUMNS LAYOUT -->
    <div class="dashboard-layout">
      
      <!-- TOPOLOGY VISUALIZER -->
      <div class="column-panel glass-panel">
        <div class="panel-header">
          <div class="panel-title">
            <svg style="width:16px;height:16px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            Global Active Rooms Mesh Visualizer
          </div>
          <input type="text" id="mesh-search" class="form-input" style="width: 220px; padding: 6px 12px; font-size: 13px;" placeholder="Search Room or Peer ID...">
        </div>
        
        <div class="scroll-container" id="rooms-list-container">
          <div class="empty-state">No active rooms found in signaling map.</div>
        </div>
      </div>

      <!-- SIDEBAR CONTROLS -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        
        <!-- BROADCAST PANEL -->
        <div class="glass-panel" style="padding: 24px;">
          <div class="panel-title" style="margin-bottom:16px">
            <svg style="width:16px;height:16px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>
            Global Broadcast System
          </div>
          <div class="form-row">
            <label class="form-label" for="broadcast-room">Target Room</label>
            <select id="broadcast-room" class="select-input">
              <option value="">Broadcast to All Rooms</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label" for="broadcast-msg">Announcement Text</label>
            <textarea id="broadcast-msg" class="textarea-input" placeholder="Type administrative announcement message..."></textarea>
          </div>
          <button class="btn" style="padding: 10px;" onclick="sendBroadcast()">
            Broadcast Announcement
          </button>
        </div>

        <!-- PERSISTENT BANS -->
        <div class="glass-panel" style="padding: 24px; flex: 1; display: flex; flex-direction: column; max-height: 270px;">
          <div class="panel-title" style="margin-bottom:16px">
            <svg style="width:16px;height:16px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            Persistent Security Blocklists
          </div>
          
          <div class="scroll-container" id="ban-list-container" style="margin-top:0">
            <div class="empty-state" style="padding:20px">No active Peer or IP bans.</div>
          </div>
        </div>

      </div>
    </div>

    <!-- AUDIT LOGS -->
    <div class="log-panel glass-panel">
      <div class="panel-title" style="margin-bottom:12px">
        <svg style="width:16px;height:16px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Administrative Real-time Audit Logs & Diagnostics
      </div>
      <div class="log-list" id="audit-log-list">
        <div class="empty-state" style="padding: 20px;">No audit events logged yet.</div>
      </div>
    </div>
  </div>

  <!-- SCRIPT FOR TELEMETRY AND UI STATE -->
  <script>
    let token = localStorage.getItem('admin_token') || '';
    let ws = null;
    let reconnectTimeout = null;
    let telemetryData = null;
    let searchFilter = '';
    
    // Canvas Charts
    const bwChartCtx = document.getElementById('bandwidth-chart').getContext('2d');
    const msgChartCtx = document.getElementById('messages-chart').getContext('2d');
    
    // Telemetry History (last 30 ticks)
    const MAX_HISTORY = 30;
    const statsHistory = {
      timestamps: [],
      bytesRxRate: [],
      bytesTxRate: [],
      msgsRxRate: [],
      msgsTxRate: []
    };
    
    let lastStats = { rxBytes: 0, txBytes: 0, rxMsgs: 0, txMsgs: 0 };
    let chartInitialized = false;

    // Standard DOM References
    const authScreen = document.getElementById('auth-screen');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    
    // Check if initially authenticated
    if (token) {
      authScreen.classList.add('hidden');
      initWebSocket();
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.style.display = 'none';
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      try {
        const res = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (res.ok) {
          const data = await res.json();
          token = data.token;
          localStorage.setItem('admin_token', token);
          authScreen.classList.add('hidden');
          initWebSocket();
        } else {
          loginError.style.display = 'block';
        }
      } catch (err) {
        loginError.style.display = 'block';
      }
    });

    function initWebSocket() {
      if (ws) {
        ws.close();
      }
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/admin/ws?token=' + encodeURIComponent(token);
      
      updateStatus(false, 'Telemetry: Connecting...');
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        updateStatus(true, 'Telemetry: Active');
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'telemetry') {
            telemetryData = packet.payload;
            updateUI();
          }
        } catch (err) {}
      };
      
      ws.onclose = (event) => {
        updateStatus(false, 'Telemetry: Offline');
        
        // Re-authenticate if token was rejected
        if (event.code === 4001) {
          logout();
          return;
        }
        
        // Auto-reconnect with backing-off strategy
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(initWebSocket, 3000);
        }
      };
      
      ws.onerror = () => {
        updateStatus(false, 'Telemetry: Error');
      };
    }

    function updateStatus(active, text) {
      const dot = document.getElementById('ws-status-dot');
      const label = document.getElementById('ws-status-text');
      
      if (active) {
        dot.classList.remove('disconnected');
        label.innerText = text;
      } else {
        dot.classList.add('disconnected');
        label.innerText = text;
      }
    }

    function logout() {
      token = '';
      localStorage.removeItem('admin_token');
      if (ws) {
        ws.close();
        ws = null;
      }
      authScreen.classList.remove('hidden');
      document.getElementById('password').value = '';
    }

    function updateUI() {
      if (!telemetryData) return;
      
      // Update KPIs
      document.getElementById('uptime-val').innerText = formatUptime(telemetryData.uptime);
      
      const activeRoomsCount = telemetryData.rooms.length;
      const activePeersCount = telemetryData.rooms.reduce((acc, r) => acc + r.peers.length, 0);
      document.getElementById('mesh-population').innerText = activeRoomsCount + ' Rooms / ' + activePeersCount + ' Peers';
      
      const totalBytes = telemetryData.stats.totalBandwidthBytesReceived + telemetryData.stats.totalBandwidthBytesSent;
      document.getElementById('bandwidth-val').innerText = formatBytes(totalBytes);
      
      const totalErrs = telemetryData.stats.totalErrors;
      const totalAuthFails = telemetryData.stats.totalAuthFailures;
      const totalConns = telemetryData.stats.totalConnectionsOpened || 1;
      const integrity = Math.max(0, Math.min(100, Math.floor(100 - (totalErrs / totalConns * 100))));
      
      const integrityText = document.getElementById('integrity-val');
      integrityText.innerText = integrity + '%';
      if (integrity < 80) {
        integrityText.style.color = 'var(--danger)';
      } else if (integrity < 95) {
        integrityText.style.color = 'var(--warning)';
      } else {
        integrityText.style.color = 'var(--success)';
      }
      document.getElementById('integrity-desc').innerText = totalErrs + ' Errors / ' + totalAuthFails + ' Auth Failures';
      
      // Update Target Room dropdown inside broadcast panel
      const broadcastSelect = document.getElementById('broadcast-room');
      const currentSelectedVal = broadcastSelect.value;
      
      // Keep option[0] (All Rooms) and clear other options
      while (broadcastSelect.options.length > 1) {
        broadcastSelect.remove(1);
      }
      
      telemetryData.rooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room.roomId;
        option.text = 'Room: ' + room.roomId.slice(0, 12) + '...';
        broadcastSelect.add(option);
      });
      broadcastSelect.value = currentSelectedVal;

      // Update Search Text
      const searchBox = document.getElementById('mesh-search');
      searchFilter = searchBox.value.toLowerCase().trim();
      
      // Render active rooms and peers lists
      renderRoomsList();
      
      // Render Banned Lists
      renderBanList();
      
      // Update real-time charts
      tickCharts();
      
      // Render Audit logs
      renderAuditLogs();
    }

    function formatUptime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
      ].join(':');
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0.00 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function renderRoomsList() {
      const container = document.getElementById('rooms-list-container');
      
      const filteredRooms = telemetryData.rooms.filter(room => {
        if (!searchFilter) return true;
        if (room.roomId.toLowerCase().includes(searchFilter)) return true;
        return room.peers.some(peer => peer.peerId.toLowerCase().includes(peer.peerId));
      });
      
      if (filteredRooms.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching rooms found.</div>';
        return;
      }
      
      // Build HTML structure dynamically to preserve collapsed states
      let html = '';
      filteredRooms.forEach(room => {
        const elementId = 'room-' + room.roomId;
        const isCollapsed = localStorage.getItem('collapsed_' + room.roomId) === 'true';
        
        html += \`
          <div class="room-item" id="\${elementId}">
            <div class="room-header" onclick="toggleRoomCollapse('\${room.roomId}')">
              <div class="room-info">
                <span class="room-badge">MESH</span>
                <span class="room-name" title="\${room.roomId}">\${room.roomId.slice(0, 16)}...</span>
              </div>
              <span class="peer-count-badge">\${room.peers.length} peers</span>
            </div>
            
            <div class="room-peers-list" style="display: \${isCollapsed ? 'none' : 'flex'}">
              \${room.peers.map(peer => {
                const connDuration = Math.max(0, Math.floor((Date.now() - peer.joinedAt) / 1000));
                return \`
                  <div class="peer-card">
                    <div class="peer-meta">
                      <span>Peer: <b title="\${peer.peerId}">\${peer.peerId.slice(0, 12)}...</b></span>
                      <span>Transport: <span class="badge \${peer.transport}">\${peer.transport}</span></span>
                      <span>Node IP: <b>\${peer.ip}</b></span>
                      <span>Connected: <b>\${formatUptime(connDuration)}</b></span>
                    </div>
                    
                    <div class="peer-actions">
                      <button class="btn-sm disconnect" onclick="forceDisconnect('\${peer.peerId}')">
                        ⚡ Disrupt Link
                      </button>
                      <button class="btn-sm ban" onclick="banPeer('\${peer.peerId}', true)">
                        🚫 Ban IP
                      </button>
                      <button class="btn-sm ban" style="background: rgba(239, 68, 68, 0.05); color:#ef4444" onclick="banPeer('\${peer.peerId}', false)">
                        🔒 Ban ID
                      </button>
                    </div>
                  </div>
                \`;
              }).join('')}
              \${room.peers.length === 0 ? '<div class="empty-state" style="padding:10px">No connected mesh peers.</div>' : ''}
            </div>
          </div>
        \`;
      });
      
      container.innerHTML = html;
    }

    window.toggleRoomCollapse = function(roomId) {
      const key = 'collapsed_' + roomId;
      const current = localStorage.getItem(key) === 'true';
      localStorage.setItem(key, !current);
      renderRoomsList();
    }

    function renderBanList() {
      const container = document.getElementById('ban-list-container');
      const banCount = telemetryData.blocklist.peers.length + telemetryData.blocklist.ips.length;
      
      if (banCount === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px">No active Peer or IP bans.</div>';
        return;
      }
      
      let html = '';
      
      telemetryData.blocklist.peers.forEach(peerId => {
        html += \`
          <div class="ban-item">
            <div>
              <span style="color:var(--danger); font-weight:600; margin-right:4px;">ID BAN:</span>
              <span class="ban-val" title="\${peerId}">\${peerId.slice(0, 16)}...</span>
            </div>
            <button class="revoke-ban-btn" onclick="unbanValue('\${peerId}', 'peer')" title="Revoke Ban">Revoke</button>
          </div>
        \`;
      });
      
      telemetryData.blocklist.ips.forEach(ip => {
        html += \`
          <div class="ban-item">
            <div>
              <span style="color:var(--warning); font-weight:600; margin-right:4px;">IP BAN:</span>
              <span class="ban-val">\${ip}</span>
            </div>
            <button class="revoke-ban-btn" onclick="unbanValue('\${ip}', 'ip')" title="Revoke Ban">Revoke</button>
          </div>
        \`;
      });
      
      container.innerHTML = html;
    }

    function renderAuditLogs() {
      const container = document.getElementById('audit-log-list');
      // Wait, telemetryData has adminLogs? Yes, let's include it in telemetry data from server!
      const logs = telemetryData.logs || [];
      
      if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">No audit events logged yet.</div>';
        return;
      }
      
      let html = '';
      logs.forEach(log => {
        const timeStr = new Date(log.timestamp).toLocaleTimeString();
        html += \`
          <div class="log-entry">
            <span class="log-time">[\${timeStr}]</span>
            <span class="log-text">\${log.message}</span>
          </div>
        \`;
      });
      
      container.innerHTML = html;
    }

    // Canvas Chart Helpers
    function tickCharts() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const rxBytes = telemetryData.stats.totalBandwidthBytesReceived;
      const txBytes = telemetryData.stats.totalBandwidthBytesSent;
      const rxMsgs = telemetryData.stats.totalMessagesReceived;
      const txMsgs = telemetryData.stats.totalMessagesSent;
      
      let bytesRxDiff = 0;
      let bytesTxDiff = 0;
      let msgsRxDiff = 0;
      let msgsTxDiff = 0;
      
      if (chartInitialized) {
        bytesRxDiff = Math.max(0, rxBytes - lastStats.rxBytes);
        bytesTxDiff = Math.max(0, txBytes - lastStats.txBytes);
        msgsRxDiff = Math.max(0, rxMsgs - lastStats.rxMsgs);
        msgsTxDiff = Math.max(0, txMsgs - lastStats.txMsgs);
      } else {
        chartInitialized = true;
      }
      
      lastStats = { rxBytes, txBytes, rxMsgs, txMsgs };
      
      statsHistory.timestamps.push(timeStr);
      statsHistory.bytesRxRate.push(bytesRxDiff);
      statsHistory.bytesTxRate.push(bytesTxDiff);
      statsHistory.msgsRxRate.push(msgsRxDiff);
      statsHistory.msgsTxRate.push(msgsTxDiff);
      
      if (statsHistory.timestamps.length > MAX_HISTORY) {
        statsHistory.timestamps.shift();
        statsHistory.bytesRxRate.shift();
        statsHistory.bytesTxRate.shift();
        statsHistory.msgsRxRate.shift();
        statsHistory.msgsTxRate.shift();
      }
      
      drawCanvasChart(bwChartCtx, statsHistory.timestamps, statsHistory.bytesRxRate, statsHistory.bytesTxRate, 'Rx (In)', 'Tx (Out)', formatBytes);
      drawCanvasChart(msgChartCtx, statsHistory.timestamps, statsHistory.msgsRxRate, statsHistory.msgsTxRate, 'Inbound', 'Outbound', v => v + ' msgs');
    }

    function drawCanvasChart(ctx, labels, data1, data2, label1, label2, valueFormatter) {
      const width = ctx.canvas.clientWidth;
      const height = ctx.canvas.clientHeight;
      ctx.canvas.width = width;
      ctx.canvas.height = height;
      
      ctx.clearRect(0, 0, width, height);
      
      // Graph Layout padding
      const padding = { top: 15, right: 15, bottom: 25, left: 55 };
      const graphWidth = width - padding.left - padding.right;
      const graphHeight = height - padding.top - padding.bottom;
      
      // Draw grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      
      const gridRows = 4;
      for (let i = 0; i <= gridRows; i++) {
        const y = padding.top + (graphHeight / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }
      
      const gridCols = 6;
      for (let i = 0; i <= gridCols; i++) {
        const x = padding.left + (graphWidth / gridCols) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();
      }
      
      if (labels.length < 2) return;
      
      const maxVal = Math.max(10, ...data1, ...data2) * 1.15;
      
      // Draw Path 1 (Data1 - Inbound / Rx)
      drawSmoothLine(ctx, padding, graphWidth, graphHeight, data1, maxVal, '#6366f1', 'rgba(99, 102, 241, 0.05)');
      
      // Draw Path 2 (Data2 - Outbound / Tx)
      drawSmoothLine(ctx, padding, graphWidth, graphHeight, data2, maxVal, '#a855f7', 'rgba(168, 85, 247, 0.05)');
      
      // Y-Axis Labels
      ctx.fillStyle = 'var(--text-muted)';
      ctx.font = '10px Inter';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      for (let i = 0; i <= gridRows; i++) {
        const val = maxVal - (maxVal / gridRows) * i;
        const y = padding.top + (graphHeight / gridRows) * i;
        ctx.fillText(valueFormatter(val), padding.left - 8, y);
      }
      
      // X-Axis Labels (Time)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xLabelsCount = 4;
      for (let i = 0; i < xLabelsCount; i++) {
        const idx = Math.floor((labels.length - 1) / (xLabelsCount - 1) * i);
        const x = padding.left + (graphWidth / (labels.length - 1)) * idx;
        ctx.fillText(labels[idx] || '', x, height - padding.bottom + 6);
      }
      
      // Draw Legends
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = '600 10px Inter';
      
      ctx.fillStyle = '#6366f1';
      ctx.fillText('■ ' + label1, width - padding.right - 100, padding.top - 12);
      
      ctx.fillStyle = '#a855f7';
      ctx.fillText('■ ' + label2, width - padding.right, padding.top - 12);
    }

    function drawSmoothLine(ctx, padding, gw, gh, data, maxVal, strokeColor, fillColor) {
      ctx.beginPath();
      
      const stepX = gw / (data.length - 1);
      
      data.forEach((val, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + gh - (val / maxVal) * gh;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          // Bezier smooth curves
          const prevX = padding.left + (i - 1) * stepX;
          const prevY = padding.top + gh - (data[i - 1] / maxVal) * gh;
          const cpX1 = prevX + stepX / 2;
          const cpY1 = prevY;
          const cpX2 = prevX + stepX / 2;
          const cpY2 = y;
          ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, x, y);
        }
      });
      
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Fill under curve
      ctx.lineTo(padding.left + (data.length - 1) * stepX, padding.top + gh);
      ctx.lineTo(padding.left, padding.top + gh);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    // Administrative Command Invocation
    window.sendBroadcast = function() {
      const msgInput = document.getElementById('broadcast-msg');
      const message = msgInput.value.trim();
      const roomId = document.getElementById('broadcast-room').value || undefined;
      
      if (!message) return;
      
      ws.send(JSON.stringify({
        type: 'broadcast',
        payload: { roomId, message }
      }));
      
      msgInput.value = '';
    }

    window.forceDisconnect = function(peerId) {
      if (!confirm('Are you sure you want to forcefully disrupt peer link for: ' + peerId + '?')) return;
      
      ws.send(JSON.stringify({
        type: 'disconnect',
        payload: { peerId }
      }));
    }

    window.banPeer = function(peerId, banIp) {
      const actionText = banIp ? 'persistently block their IP address' : 'persistently block their Peer ID';
      if (!confirm('Are you sure you want to ' + actionText + ' (' + peerId + ')?')) return;
      
      ws.send(JSON.stringify({
        type: 'ban',
        payload: { peerId, banIp }
      }));
    }

    window.unbanValue = function(value, type) {
      if (!confirm('Are you sure you want to revoke ban on ' + type + ': ' + value + '?')) return;
      
      ws.send(JSON.stringify({
        type: 'unban',
        payload: { value, type }
      }));
    }
  </script>
</body>
</html>`;
