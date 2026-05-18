"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  ArrowLeft,
  Copy,
  Check,
  Terminal,
  Search,
  Book,
  Code,
  Server,
  Database,
  Globe,
  Zap,
  FileText,
  Menu,
  X,
  Shield,
  Brain,
  ShoppingCart,
  MessageSquare,
  Smartphone,
  Gamepad2,
} from "lucide-react";

type Framework = {
  id: string;
  name: string;
  language: string;
  install: string;
  steps: { title: string; code: string; description: string }[];
};

const FRAMEWORKS: Framework[] = [
  {
    id: "react",
    name: "React / Next.js",
    language: "tsx",
    install: "npm install zerithdb-sdk zerithdb-react",
    steps: [
      {
        title: "1. Wrap your app with the Provider",
        description: "Initialize the CRDT engine and WebRTC pool at the root of your application.",
        code: "import { ZerithProvider } from 'zerithdb-react';\n\nexport default function App({ children }) {\n  return (\n    <ZerithProvider config={{ appId: 'my-app', sync: true }}>\n      {children}\n    </ZerithProvider>\n  );\n}",
      },
      {
        title: "2. Read and Write Data",
        description:
          "Use our custom hooks to interact with local-first collections. Data instantly syncs across peers.",
        code: "import { useQuery } from 'zerithdb-react';\n\nfunction TodoList() {\n  // Subscribes to IndexedDB & WebRTC changes automatically\n  const { data: todos, insert } = useQuery('todos');\n\n  return (\n    <div>\n      {todos.map(todo => <p key={todo.id}>{todo.text}</p>)}\n      <button onClick={() => insert({ text: 'New Todo' })}>\n        Add Todo\n      </button>\n    </div>\n  );\n}",
      },
    ],
  },
  {
    id: "vanilla",
    name: "Vanilla JavaScript",
    language: "javascript",
    install: "npm install zerithdb-sdk",
    steps: [
      {
        title: "1. Initialize the Client",
        description: "Create a local-first database instance. Storage defaults to IndexedDB.",
        code: "import { createClient } from 'zerithdb-sdk';\n\nconst db = createClient({\n  appId: 'my-app',\n  storage: 'indexeddb',\n  p2p: true \n});",
      },
      {
        title: "2. Subscribe to Changes",
        description: "Listen for CRDT merges from other peers in real-time.",
        code: "db.collection('messages').subscribe((messages) => {\n  document.getElementById('msg-list').innerHTML = messages\n    .map(m => '<li>' + m.text + '</li>')\n    .join('');\n});",
      },
      {
        title: "3. Mutate Data",
        description:
          "Writes are synchronous locally (0ms) and broadcasted to peers asynchronously.",
        code: "async function sendMessage(text) {\n  await db.collection('messages').insert({\n    text,\n    timestamp: Date.now()\n  });\n}",
      },
    ],
  },
  {
    id: "python",
    name: "Python (Backend/CLI)",
    language: "python",
    install: "pip install zerithdb",
    steps: [
      {
        title: "1. Connect Python Client",
        description:
          "Instantiate the backend client to act as an authoritative peer or to ingest webhooks.",
        code: "from zerithdb import Client\n\n# Initialize the Python client\ndb = Client(app_id='my-app')",
      },
      {
        title: "2. Sync Server Events",
        description:
          "Insert events locally; the ZerithDB engine will relay them to all connected browser peers.",
        code: "def sync_event(event_data):\n    # Inserts into local storage & syncs via network\n    db.collection('events').insert(event_data)\n    print(f'Event synced: {event_data}')\n\nsync_event({\n    'type': 'server_restart',\n    'timestamp': 1690000000\n})",
      },
    ],
  },
];

const SIDEBAR_LINKS = [
  {
    category: "Getting Started",
    icon: Book,
    items: ["Introduction", "Quickstart", "Installation"],
  },
  {
    category: "Core Concepts",
    icon: Database,
    items: [
      "CRDT Synchronization",
      "Peer-to-Peer Networks",
      "Offline-First Storage",
      "Conflict Resolution",
    ],
  },
  {
    category: "Applications",
    icon: Globe,
    items: ["Real-World Applications"],
  },
  {
    category: "API Reference",
    icon: Code,
    items: ["Client Configuration", "Collections", "Queries", "Auth & Permissions"],
  },
  {
    category: "Platform",
    icon: Server,
    items: ["Signaling Servers", "TURN / STUN Relays", "Troubleshooting", "Pricing", "Enterprise"],
  },
];

const DOC_CONTENT: Record<string, React.ReactNode> = {
  Introduction: (
    <div className="space-y-6 text-muted-foreground leading-relaxed text-lg transition-colors duration-300">
      <p>
        ZerithDB is a revolutionary local-first, peer-to-peer database built for the modern web. It
        allows developers to build responsive, offline-capable applications without the latency and
        complexity of traditional cloud databases.
      </p>
      <h3 className="text-2xl font-bold text-foreground mt-12 mb-4 transition-colors duration-300">
        Why Local-First?
      </h3>
      <p>
        Traditional web applications rely on a central server for every read and write operation.
        This means your app is only as fast as the network connection. Local-first applications
        reverse this paradigm: data is written to and read from a local database immediately, and
        then synced asynchronously in the background.
      </p>
      <h3 className="text-2xl font-bold text-foreground mt-12 mb-4 transition-colors duration-300">
        Core Benefits
      </h3>
      <ul className="list-disc pl-6 space-y-3">
        <li>
          <strong>Zero Latency:</strong> Operations happen locally at the speed of the device.
        </li>
        <li>
          <strong>Offline Support:</strong> Apps work flawlessly without internet access.
        </li>
        <li>
          <strong>Real-time Multiplayer:</strong> Changes merge automatically using CRDTs.
        </li>
        <li>
          <strong>Reduced Server Costs:</strong> P2P syncing offloads bandwidth from your servers.
        </li>
      </ul>
    </div>
  ),
  Installation: (
    <div className="space-y-6 text-muted-foreground leading-relaxed text-lg transition-colors duration-300">
      <p>
        ZerithDB is available as a set of NPM packages. Depending on your stack, you can install the
        core SDK or framework-specific wrappers.
      </p>
      <h3 className="text-2xl font-bold text-foreground mt-12 mb-4 transition-colors duration-300">
        Core JavaScript SDK
      </h3>
      <div className="bg-slate-950/95 dark:bg-slate-950 p-4 rounded-lg text-slate-200 font-mono text-sm border border-slate-800/90">
        npm install zerithdb-sdk
      </div>
      <h3 className="text-2xl font-bold text-foreground mt-12 mb-4 transition-colors duration-300">
        React & Next.js
      </h3>
      <div className="bg-slate-950/95 dark:bg-slate-950 p-4 rounded-lg text-slate-200 font-mono text-sm border border-slate-800/90">
        npm install zerithdb-react
      </div>
      <h3 className="text-2xl font-bold text-foreground mt-12 mb-4 transition-colors duration-300">
        Python Backend
      </h3>
      <div className="bg-slate-950/95 dark:bg-slate-950 p-4 rounded-lg text-slate-200 font-mono text-sm border border-slate-800/90">
        pip install zerithdb
      </div>
    </div>
  ),
  "CRDT Synchronization": (
    <div className="space-y-6 text-muted-foreground leading-relaxed text-lg transition-colors duration-300">
      <p>
        At the heart of ZerithDB is a Conflict-free Replicated Data Type (CRDT) engine. CRDTs are
        data structures that can be replicated across multiple computers in a network, updated
        independently, and mathematically guaranteed to converge to the same state.
      </p>
      <div className="p-6 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/70 rounded-xl text-blue-900 dark:text-blue-200 mt-8 transition-colors duration-300">
        <strong>How it works:</strong> Instead of storing absolute values (e.g., &quot;count is
        5&quot;), ZerithDB stores causal operations (e.g., &quot;add 1 to count&quot;). By securely
        distributing these operations using vector clocks, all peers arrive at the same outcome
        without central locking.
      </div>
      <p className="mt-8">
        We use an optimized implementation of Yjs/Automerge-like algorithms customized for fast
        IndexedDB querying.
      </p>
    </div>
  ),
  "Peer-to-Peer Networks": (
    <div className="space-y-6 text-muted-foreground leading-relaxed text-lg transition-colors duration-300">
      <p>
        To eliminate server bottlenecks, ZerithDB relies heavily on WebRTC data channels for
        real-time synchronization between clients.
      </p>
      <ul className="list-disc pl-6 space-y-3 mt-6">
        <li>
          <strong>Signaling:</strong> A lightweight WebSocket server is used only to exchange IP
          addresses.
        </li>
        <li>
          <strong>Direct Connection:</strong> Once connected, browsers exchange CRDT operations
          directly with zero server middleman.
        </li>
        <li>
          <strong>Mesh Topology:</strong> Clients form a resilient mesh network to distribute data
          even if some nodes go offline.
        </li>
      </ul>
    </div>
  ),
  "Offline-First Storage": (
    <div className="space-y-6 text-muted-foreground leading-relaxed text-lg transition-colors duration-300">
      <p>
        All writes in ZerithDB are synchronously written to a local database before any network
        request is made. On the web, we use <code>IndexedDB</code>.
      </p>
      <p>
        If the user loses internet connection, they can continue interacting with the app. Once the
        connection is restored, the sync engine automatically flushes the queue of pending
        operations to the P2P network.
      </p>
    </div>
  ),
  "Real-World Applications": (
    <div className="space-y-10 text-muted-foreground transition-colors duration-300">

      <div className="space-y-4">
        <p className="text-lg leading-8 max-w-3xl">
          ZerithDB enables developers to build local-first, peer-to-peer
          applications that remain responsive even without internet connectivity.
          Its CRDT-powered synchronization and offline-first architecture make it
          suitable for collaborative, real-time, and privacy-focused systems.
        </p>
      </div>

      {/* APPLICATIONS */}
      <div className="space-y-4">

        {/* Collaboration */}
        <div className="border border-border rounded-xl p-5 bg-background transition-colors">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-blue-500" />
            </div>

            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Collaborative Applications
              </h3>

              <p className="text-sm leading-7 mb-3">
                Build collaborative editors, shared workspaces, whiteboards,
                and productivity tools with seamless CRDT synchronization.
              </p>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Collaborative note-taking tools</li>
                <li>Shared project boards</li>
                <li>Live document editing</li>
                <li>Offline-first productivity apps</li>
              </ul>
            </div>
          </div>
        </div>

        {/* AI */}
        <div className="border border-border rounded-xl p-5 bg-background transition-colors">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <Brain className="w-5 h-5 text-purple-500" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                AI & Edge Intelligence
              </h3>

              <p className="text-sm leading-7 mb-3">
                Synchronize AI-generated data locally while enabling low-latency,
                peer-to-peer AI workflows and distributed intelligence systems.
              </p>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Offline AI copilots</li>
                <li>Edge ML synchronization</li>
                <li>Distributed AI agents</li>
                <li>Local vector search systems</li>
              </ul>
            </div>
          </div>
        </div>

        {/* E-commerce */}
        <div className="border border-border rounded-xl p-5 bg-background transition-colors">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-5 h-5 text-green-500" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                E-Commerce Platforms
              </h3>

              <p className="text-sm leading-7 mb-3">
                Deliver fast storefront experiences with local reads,
                background synchronization, and resilient offline carts.
              </p>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Offline shopping carts</li>
                <li>Inventory synchronization</li>
                <li>Instant product browsing</li>
                <li>Marketplace synchronization</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="border border-border rounded-xl p-5 bg-background transition-colors">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-orange-500" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Offline Mobile Applications
              </h3>

              <p className="text-sm leading-7 mb-3">
                Create resilient mobile experiences for low-connectivity
                environments using ZerithDB’s local-first architecture.
              </p>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Field workforce systems</li>
                <li>Travel applications</li>
                <li>Healthcare platforms</li>
                <li>Education tools</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Gaming */}
        <div className="border border-border rounded-xl p-5 bg-background transition-colors">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center flex-shrink-0">
              <Gamepad2 className="w-5 h-5 text-pink-500" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Multiplayer Gaming
              </h3>

              <p className="text-sm leading-7 mb-3">
                Power decentralized multiplayer systems with conflict-free
                synchronization and real-time peer communication.
              </p>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Realtime multiplayer games</li>
                <li>Game state synchronization</li>
                <li>Peer-hosted lobbies</li>
                <li>Distributed leaderboards</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="border border-border rounded-xl p-5 bg-background transition-colors">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-red-500" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Secure & Private Systems
              </h3>

              <p className="text-sm leading-7 mb-3">
                End-to-end encrypted synchronization and decentralized identity
                management make ZerithDB ideal for privacy-focused systems.
              </p>

              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Secure messaging platforms</li>
                <li>Encrypted collaboration tools</li>
                <li>Identity-driven systems</li>
                <li>Private communication networks</li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      {/* ECOSYSTEM */}
      <div className="pt-4">
        <h2 className="text-2xl font-semibold text-foreground mb-3">
          Ecosystem
        </h2>

        <p className="text-base leading-7 mb-6 max-w-3xl">
          ZerithDB provides modular packages for building collaborative and
          offline-first applications across multiple platforms.
        </p>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-foreground">
                  Package
                </th>

                <th className="px-4 py-3 font-semibold text-foreground hidden lg:table-cell">
                  Installation
                </th>

                <th className="px-4 py-3 font-semibold text-foreground">
                  Description
                </th>
              </tr>
            </thead>

            <tbody>
              {[
                ["zerithdb-sdk", "npm install zerithdb-sdk", "Main SDK"],
                ["zerithdb-db", "npm install zerithdb-db", "IndexedDB adapter"],
                ["zerithdb-sync", "npm install zerithdb-sync", "CRDT sync engine"],
                ["zerithdb-network", "npm install zerithdb-network", "WebRTC layer"],
                ["zerithdb-auth", "npm install zerithdb-auth", "Authentication"],
                ["zerithdb-core", "npm install zerithdb-core", "Shared utilities"],
                ["zerithdb-cli", "npm install -g zerithdb-cli", "CLI tooling"],
                ["zerithdb-react", "npm install zerithdb-react", "React integration"],
                ["zerithdb-python", "pip install zerithdb-python", "Python SDK"],
              ].map((pkg, idx) => (
                <tr
                  key={idx}
                  className="border-t border-border"
                >
                  <td className="px-4 py-3 font-mono text-blue-500">
                    {pkg[0]}
                  </td>

                  <td className="px-4 py-3 font-mono hidden lg:table-cell">
                    {pkg[1]}
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {pkg[2]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  ),
  Troubleshooting: (
    <div className="space-y-6 text-gray-600 leading-relaxed text-lg">
      <p>
        Because ZerithDB is a local-first application platform operating entirely in the browser, it
        avoids traditional centralized server bottlenecks by forming a resilient, encrypted mesh
        network among peers. This decentralized synchronization relies heavily on browser-level
        WebRTC connections orchestrated initially via a minimal signaling server.
      </p>
      <p>
        However, real-world network configurations (firewalls, asymmetric NATs, and strict browser
        sandboxing) can occasionally prevent peers from handshaking or maintaining active data
        streams. Use this guide to diagnose and resolve common connectivity issues.
      </p>

      <h3
        id="webrtc-nat-issue"
        className="text-2xl font-bold text-gray-900 mt-12 mb-4 scroll-mt-20"
      >
        1. Initial Connection Fails Between Peers on Different Networks
      </h3>
      <ul className="list-disc pl-6 space-y-3">
        <li>
          <strong>Symptom:</strong> Peers on the same Wi-Fi network sync instantly, but a peer on a
          home network cannot connect to a peer on a corporate network or cellular data.
        </li>
        <li>
          <strong>Cause:</strong> This is typically caused by a NAT (Network Address Translation) or
          firewall restriction blocking direct P2P socket discovery. While simple STUN mapping
          handles basic routers, strict enterprise or symmetric NATs hide the internal IP/Port
          mapping dynamically, preventing direct connections via standard ICE candidates.
        </li>
        <li>
          <strong>Solution:</strong> You need a TURN (Traversal Using Relays around NAT) server to
          safely fallback and relay encrypted traffic between strict networks. Configure your
          initialization to supply custom ICE servers:
        </li>
      </ul>

      <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm group mt-6">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
            <span className="ml-2 font-medium">app.config.ts</span>
          </div>
        </div>
        <div className="p-6 bg-gray-900 overflow-x-auto">
          <pre className="text-[13px] font-mono text-gray-300 leading-relaxed">
            <code>
              {`import { createApp } from "zerithdb-sdk";

const app = createApp({
  appId: "my-secure-app",
  sync: {
    signalingUrl: "wss://signal.zerithdb.dev",
    // Supply explicit TURN/STUN configuration for restrictive firewalls
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:your-custom-turn-server.com:3478",
        username: "zerith_user",
        credential: "secure_password_here"
      }
    ]
  }
});`}
            </code>
          </pre>
        </div>
      </div>

      <h3
        id="connection-drops"
        className="text-2xl font-bold text-gray-900 mt-12 mb-4 scroll-mt-20"
      >
        2. Connection Drops After Inactivity
      </h3>
      <p>
        Some aggressive NAT routers close UDP mappings if no data is exchanged for a short period
        (usually 30-60 seconds). ZerithDB automatically sends keep-alive heartbeats, but you can
        adjust the interval if you notice frequent reconnections on specific networks.
      </p>
    </div>
  ),
};

export default function DocsPage() {
  const [activeId, setActiveId] = useState("react");
  const [activeSection, setActiveSection] = useState("Quickstart");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const activeFramework = FRAMEWORKS.find((f) => f.id === activeId) || FRAMEWORKS[0];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyInstall = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
  };

  // Render specific content if available, otherwise generic text
  const renderContent = () => {
    if (activeSection === "Quickstart") {
      return (
        <>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed max-w-3xl transition-colors duration-300">
            Get up and running with ZerithDB in less than 2 minutes. Choose your preferred framework
            below to see the boilerplate code required to initialize your local-first database.
          </p>

          <div className="flex flex-wrap gap-2 mb-10 border-b border-border pb-px transition-colors duration-300">
            {FRAMEWORKS.map((fw) => (
              <button
                key={fw.id}
                onClick={() => setActiveId(fw.id)}
                className={
                  "px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px " +
                  (activeId === fw.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-slate-600 dark:text-muted-foreground hover:text-foreground hover:border-border")
                }
              >
                {fw.name}
              </button>
            ))}
          </div>

          <div className="mb-12">
            <h2
              id="install-the-sdk"
              className="text-xl font-bold text-foreground mb-4 flex items-center gap-2 scroll-mt-20 transition-colors duration-300"
            >
              <Terminal className="w-5 h-5 text-muted-foreground" />
              Install the SDK
            </h2>
            <div className="flex items-center justify-between bg-slate-950/95 dark:bg-slate-950 rounded-xl p-4 shadow-sm border border-slate-800/90 transition-colors duration-300">
              <code className="text-sm font-mono text-slate-200">{activeFramework.install}</code>
              <button
                onClick={() => handleCopyInstall(activeFramework.install)}
                className="p-2 hover:bg-slate-800 rounded-md transition-colors text-muted-foreground hover:text-foreground"
                title="Copy command"
              >
                {copiedInstall ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-12">
            {activeFramework.steps.map((step, idx) => (
              <div key={idx} className="group">
                <div className="flex items-start gap-4 mb-3">
                  <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 flex items-center justify-center text-xs font-bold border border-blue-100 dark:border-blue-800 transition-colors duration-300">
                    {idx + 1}
                  </div>
                  <h3
                    id={slugify(step.title)}
                    className="text-lg font-bold text-foreground group-hover:text-blue-600 transition-colors scroll-mt-20 duration-300"
                  >
                    {step.title}
                  </h3>
                </div>
                <p className="text-muted-foreground mb-4 ml-10 transition-colors duration-300">
                  {step.description}
                </p>
                <div className="ml-10 relative group/code bg-muted border border-border rounded-xl overflow-hidden shadow-sm transition-colors duration-300">
                  <div className="bg-muted border-b border-border px-4 py-2.5 flex items-center justify-between transition-colors duration-300">
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
                      <span className="ml-2 font-medium">example.{activeFramework.language}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(step.code, idx)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedIndex === idx ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="p-6 bg-slate-950/95 dark:bg-slate-950 overflow-x-auto transition-colors duration-300">
                    <pre className="text-[13px] font-mono text-slate-200 leading-relaxed">
                      <code>{step.code}</code>
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            id="next-steps"
            className="mt-16 p-8 bg-gradient-to-br from-muted/50 to-background rounded-2xl border border-border shadow-sm relative overflow-hidden scroll-mt-20 transition-colors duration-300"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <Zap className="w-32 h-32" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3 transition-colors duration-300">
              You&apos;re ready to build!
            </h3>
            <p className="text-muted-foreground mb-6 max-w-xl transition-colors duration-300">
              You&apos;ve successfully set up the foundation for a zero-backend application. Explore
              the advanced topics to unlock the full power of ZerithDB.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Link
                href="/playground"
                className="flex items-center gap-3 p-4 bg-background border border-border rounded-xl hover:border-blue-300 hover:shadow-md transition-all duration-300 group"
              >
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-300 rounded-lg flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors duration-300">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm transition-colors duration-300">
                    Interactive Playground
                  </div>
                  <div className="text-xs text-muted-foreground transition-colors duration-300">
                    Test offline/online sync locally
                  </div>
                </div>
              </Link>
              <button
                onClick={() => setActiveSection("CRDT Synchronization")}
                className="flex items-center gap-3 p-4 bg-background border border-border rounded-xl hover:border-border hover:shadow-md transition-all duration-300 group text-left"
              >
                <div className="w-10 h-10 bg-muted text-foreground rounded-lg flex items-center justify-center group-hover:bg-muted/80 transition-colors duration-300">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm transition-colors duration-300">
                    Architecture Deep Dive
                  </div>
                  <div className="text-xs text-muted-foreground transition-colors duration-300">
                    Learn how P2P CRDTs work
                  </div>
                </div>
              </button>
            </div>
          </div>
        </>
      );
    }

    if (DOC_CONTENT[activeSection]) {
      return DOC_CONTENT[activeSection];
    }

    // Generic fallback for missing sections
    return (
      <div className="space-y-6 text-muted-foreground leading-relaxed text-lg transition-colors duration-300">
        <p>
          Welcome to the <strong>{activeSection}</strong> documentation. ZerithDB is designed to
          handle this seamlessly, ensuring your applications remain fast, reliable, and real-time
          across the globe.
        </p>
        <p>
          In traditional architecture, handling {activeSection.toLowerCase()} requires immense
          overhead, central database locking, and complex state reconciliation. ZerithDB bypasses
          all of this by utilizing advanced local-first patterns.
        </p>
        <h3 className="text-2xl font-bold text-foreground mt-12 mb-4 transition-colors duration-300">
          Key Mechanisms
        </h3>
        <ul className="list-disc pl-6 space-y-3">
          <li>
            <strong>Optimistic Updates:</strong> The UI updates instantly without waiting for
            network verification.
          </li>
          <li>
            <strong>Background Sync:</strong> Data associated with {activeSection.toLowerCase()}{" "}
            synchronizes transparently when the network is available.
          </li>
          <li>
            <strong>Peer Discovery:</strong> WebRTC channels automatically negotiate direct
            connections to resolve state.
          </li>
        </ul>
        <div className="mt-12 p-6 bg-muted border border-border rounded-xl transition-colors duration-300">
          <h4 className="font-semibold text-foreground mb-2 transition-colors duration-300">
            Note on Implementation
          </h4>
          <p className="text-sm text-muted-foreground transition-colors duration-300">
            The specific API surface for {activeSection.toLowerCase()} is currently being
            standardized in the upcoming v1.0 release. Check back soon for detailed code snippets.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-300">
      <header className="bg-background border-b border-border px-6 h-16 flex items-center justify-between sticky top-0 z-50 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <button className="lg:hidden text-foreground" onClick={() => setMobileSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div className="h-4 w-px bg-border"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/logo.svg" alt="ZerithDB Logo" className="w-full h-full" />
            </div>
            <span className="font-semibold text-foreground text-lg tracking-tight">
              Documentation
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <ThemeToggle />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documentation... (Press '/')"
              className="pl-9 pr-4 py-1.5 bg-muted border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 transition-colors duration-300"
            />
          </div>
          <Link
            href="/playground"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Playground
          </Link>
          <Link
            href="/docs/schema-builder"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Schema Builder
          </Link>
          <a
            href="https://github.com/Zerith-Labs/ZerithDB"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </header>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex max-w-[1400px] mx-auto w-full">
        <aside
          className={`fixed top-0 left-0 h-full w-72 bg-background border-r border-border z-50 transform transition-transform duration-300 lg:hidden ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Documentation</h2>

            <button onClick={() => setMobileSidebarOpen(false)}>
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>

          <div className="space-y-8 p-6 overflow-y-auto">
            {SIDEBAR_LINKS.map((section, idx) => {
              const SectionIcon = section.icon;

              return (
                <div key={idx}>
                  <h3 className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-2">
                    <SectionIcon className="w-3.5 h-3.5" />
                    {section.category}
                  </h3>

                  <ul className="flex flex-col gap-1.5 border-l border-border ml-1.5 pl-3">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <button
                          onClick={() => {
                            setActiveSection(item);
                            setMobileSidebarOpen(false);
                          }}
                          className={
                            "text-sm font-medium transition-colors text-left w-full " +
                            (item === activeSection
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground hover:text-foreground")
                          }
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        <aside className="w-72 border-r border-border py-8 pr-6 pl-6 hidden lg:block overflow-y-auto h-[calc(100vh-4rem)] sticky top-16 transition-colors duration-300">
          <div className="space-y-8">
            {SIDEBAR_LINKS.map((section, idx) => {
              const SectionIcon = section.icon;
              return (
                <div key={idx}>
                  <h3 className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-2 transition-colors duration-300">
                    <SectionIcon className="w-3.5 h-3.5" />
                    {section.category}
                  </h3>
                  <ul className="flex flex-col gap-1.5 border-l border-border ml-1.5 pl-3 transition-colors duration-300">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveSection(item);
                          }}
                          className={
                            "text-sm font-medium transition-colors text-left w-full " +
                            (item === activeSection
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground hover:text-foreground")
                          }
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 py-10 px-6 lg:px-16 overflow-y-auto scroll-smooth">
          <div className="max-w-4xl mx-auto">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors duration-300">
              <span className="hover:text-foreground cursor-pointer transition-colors duration-300">
                Docs
              </span>
              <span>/</span>
              <span className="text-foreground transition-colors duration-300">
                {activeSection}
              </span>
            </div>

            <h1
              id="overview"
              className="text-4xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight scroll-mt-20 transition-colors duration-300"
            >
              {activeSection}
            </h1>

            {renderContent()}
          </div>
        </main>

        {/* RIGHT SIDEBAR - ON THIS PAGE */}
        <aside className="w-64 py-10 pr-6 hidden xl:block sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto transition-colors duration-300">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-4 transition-colors duration-300">
            On this page
          </h4>
          <ul className="space-y-3 text-sm text-muted-foreground font-medium border-l border-border pl-4 transition-colors duration-300">
            {activeSection === "Quickstart" ? (
              <>
                <li>
                  <a
                    href="#overview"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Overview
                  </a>
                </li>

                <li>
                  <a
                    href="#install-the-sdk"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Install the SDK
                  </a>
                </li>

                {activeFramework.steps.map((step, idx) => (
                  <li key={idx}>
                    <a
                      href={`#${slugify(step.title)}`}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1"
                    >
                      {step.title}
                    </a>
                  </li>
                ))}

                <li>
                  <a
                    href="#next-steps"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Next Steps
                  </a>
                </li>
              </>
            ) : activeSection === "Troubleshooting" ? (
              <>
                <li>
                  <a href="#overview" className="hover:text-blue-600 transition-colors">
                    Overview
                  </a>
                </li>
                <li>
                  <a href="#webrtc-nat-issue" className="hover:text-blue-600 transition-colors">
                    1. WebRTC & NAT Issues
                  </a>
                </li>
                <li>
                  <a href="#connection-drops" className="hover:text-blue-600 transition-colors">
                    2. Connection Drops
                  </a>
                </li>
              </>
            ) : (
              <li>
                <a href="#overview" className="text-blue-600 dark:text-blue-400 transition-colors">
                  Overview
                </a>
              </li>
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
