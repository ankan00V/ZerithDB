"use client";

import { useEffect, useState, useRef } from "react";
import { getZerithApp } from "@/lib/zerith";
import { parseNaturalLanguageQuery, type ParsedQuery } from "@/lib/nlp";
import { 
  Send, Database, Sparkles, Terminal, Table as TableIcon, BarChart2, 
  Code, RefreshCw, Layers, CheckCircle2, Info,
  Copy, Check, User, ShoppingBag, ListTodo, FileText, Server, Flame
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "ai" | "system";
  text: string;
  queryPlan?: ParsedQuery;
  latency?: number;
  recordsCount?: number;
  timestamp: Date;
}

// Preset natural language query suggestions
const SAMPLE_QUERIES = [
  { text: "Show all active admin users", icon: User },
  { text: "Find products cheaper than $100", icon: ShoppingBag },
  { text: "List completed todos", icon: ListTodo },
  { text: "Show error logs", icon: FileText },
];

export default function AdminExplorer() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSynced, setIsSynced] = useState(false);
  const [activeTab, setActiveTab] = useState<"table" | "chart" | "json">("table");
  const [activeCollection, setActiveCollection] = useState("todos");
  
  // Real database records
  const [dbData, setDbData] = useState<Record<string, any[]>>({
    todos: [],
    products: [],
    users: [],
    orders: [],
    logs: []
  });
  
  const [selectedResults, setSelectedResults] = useState<any[]>([]);
  const [currentQueryPlan, setCurrentQueryPlan] = useState<ParsedQuery | null>(null);
  const [queryLatency, setQueryLatency] = useState<number | null>(null);
  
  const [isSeeding, setIsSeeding] = useState(false);
  const [hasSeeded, setHasSeeded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load database and sync state on mount
  useEffect(() => {
    const app = getZerithApp();

    const fetchAllCollections = async () => {
      const collections = ["todos", "products", "users", "orders", "logs"];
      const newData: Record<string, any[]> = {};
      
      for (const col of collections) {
        try {
          const docs = await app.db(col).find({});
          newData[col] = docs || [];
        } catch (e) {
          newData[col] = [];
        }
      }
      setDbData(newData);
      
      // Update selected results for active collection if we haven't run any query yet
      if (!currentQueryPlan) {
        setSelectedResults(newData[activeCollection] || []);
      }
    };

    fetchAllCollections();
    
    // Simple interval polling to simulate live database reactivity in the explorer
    const interval = setInterval(fetchAllCollections, 2000);

    const handleSyncChange = (state: { synced: boolean }) => {
      setIsSynced(state.synced);
    };

    app.sync.on("state:change", handleSyncChange);
    setIsSynced(app.sync.state.synced);

    // Seed system greetings
    setMessages([
      {
        id: "greet",
        sender: "ai",
        text: "Welcome to ZerithDB Chat-to-Query Admin Explorer! I am your local, completely offline AI Copilot. I can translate your natural language requests into direct ZerithDB queries instantly. \n\nClick one of the suggestions below or seed the database to get started!",
        timestamp: new Date()
      }
    ]);

    return () => {
      clearInterval(interval);
      app.sync.off("state:change", handleSyncChange);
    };
  }, [activeCollection, currentQueryPlan]);

  // Seed standard dummy data into the database
  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    const app = getZerithApp();

    try {
      // 1. Seed Todos
      const todoCollection = app.db("todos");
      const existingTodos = await todoCollection.find({});
      if (existingTodos.length === 0) {
        const todos = [
          { text: "Draft ZerithDB offline scaling blueprint", completed: true },
          { text: "Fix WebSocket connection token validation error", completed: false },
          { text: "Implement multi-tier P2P sync protocols", completed: true },
          { text: "Optimize database sharding performance", completed: false },
          { text: "Design premium dashboard interface templates", completed: false }
        ];
        for (const todo of todos) {
          await todoCollection.insert(todo);
        }
      }

      // 2. Seed Products
      const productCollection = app.db("products");
      const existingProducts = await productCollection.find({});
      if (existingProducts.length === 0) {
        const products = [
          { name: "Zerith Pro Controller", category: "Electronics", price: 89.99, stock: 120 },
          { name: "Quantum Mechanical Keyboard", category: "Electronics", price: 149.50, stock: 45 },
          { name: "Cyberpunk Glow Keycaps", category: "Electronics", price: 29.99, stock: 200 },
          { name: "Ultra-Wide Curve Monitor", category: "Electronics", price: 399.99, stock: 15 },
          { name: "Sleek Leather Desk Mat", category: "Home & Kitchen", price: 35.00, stock: 80 },
          { name: "Ergonomic Lumbar Cushion", category: "Home & Kitchen", price: 49.99, stock: 65 },
          { name: "Introduction to Local-First Systems", category: "Books", price: 19.99, stock: 150 },
          { name: "Mastering Database Internals", category: "Books", price: 59.99, stock: 30 }
        ];
        for (const prod of products) {
          await productCollection.insert(prod);
        }
      }

      // 3. Seed Users
      const userCollection = app.db("users");
      const existingUsers = await userCollection.find({});
      if (existingUsers.length === 0) {
        const users = [
          { name: "Alex Rivera", role: "admin", active: true, email: "alex@zerithdb.dev" },
          { name: "Sarah Connor", role: "moderator", active: true, email: "sarah@zerithdb.dev" },
          { name: "Bruce Wayne", role: "admin", active: false, email: "bruce@wayne.co" },
          { name: "Diana Prince", role: "customer", active: true, email: "diana@themyscira.org" },
          { name: "Clark Kent", role: "customer", active: true, email: "clark@dailyplanet.com" },
          { name: "Barry Allen", role: "customer", active: false, email: "barry@star.labs" }
        ];
        for (const user of users) {
          await userCollection.insert(user);
        }
      }

      // 4. Seed Orders
      const orderCollection = app.db("orders");
      const existingOrders = await orderCollection.find({});
      if (existingOrders.length === 0) {
        const orders = [
          { orderId: "Z-1001", customerName: "Diana Prince", amount: 119.98, status: "delivered" },
          { orderId: "Z-1002", customerName: "Clark Kent", amount: 19.99, status: "pending" },
          { orderId: "Z-1003", customerName: "Alex Rivera", amount: 399.99, status: "delivered" },
          { orderId: "Z-1004", customerName: "Sarah Connor", amount: 149.50, status: "pending" },
          { orderId: "Z-1005", customerName: "Bruce Wayne", amount: 209.97, status: "cancelled" }
        ];
        for (const ord of orders) {
          await orderCollection.insert(ord);
        }
      }

      // 5. Seed Logs
      const logCollection = app.db("logs");
      const existingLogs = await logCollection.find({});
      if (existingLogs.length === 0) {
        const logs = [
          { text: "Server signal websocket handshake initialized", level: "info", module: "sync" },
          { text: "Database connection successfully bound to indexedDB", level: "info", module: "db" },
          { text: "Failed to establish signaling bridge, attempting reconnect in 5s", level: "warn", module: "sync" },
          { text: "Sync token mismatch: peer wss://signal.zerithdb.dev rejected connection", level: "error", module: "sync" },
          { text: "Garbage collection cleaned 23 unreferenced sharded nodes", level: "info", module: "core" }
        ];
        for (const log of logs) {
          await logCollection.insert(log);
        }
      }

      // Refresh database state
      const collections = ["todos", "products", "users", "orders", "logs"];
      const newData: Record<string, any[]> = {};
      for (const col of collections) {
        const docs = await app.db(col).find({});
        newData[col] = docs || [];
      }
      setDbData(newData);
      setSelectedResults(newData[activeCollection] || []);
      setHasSeeded(true);

      setMessages(prev => [
        ...prev,
        {
          id: `seed-${Date.now()}`,
          sender: "system",
          text: "✅ Database seeded successfully with realistic products, orders, active users, tasks, and system logs! Ask any question now.",
          timestamp: new Date()
        }
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSeeding(false);
    }
  };

  // Run the Natural Language query translation and local DB lookup
  const runQuery = async (queryText: string) => {
    if (!queryText.trim()) return;

    const start = performance.now();
    const app = getZerithApp();

    // 1. Add user query message to screen
    const userMsgId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMsgId,
      sender: "user",
      text: queryText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText("");

    // 2. Parse natural language into structured filter
    const queryPlan = parseNaturalLanguageQuery(queryText);
    
    // 3. Execute query on ZerithDB database
    try {
      const collectionName = queryPlan.collection;
      setActiveCollection(collectionName);
      
      const rawDocs = await app.db(collectionName).find({});
      
      // Apply filters client-side to replicate DB engine lookup
      let filtered = [...rawDocs];
      
      // Perform matching based on generated filters
      Object.entries(queryPlan.filter).forEach(([key, filterVal]) => {
        if (filterVal && typeof filterVal === "object" && !Array.isArray(filterVal)) {
          // Range operators like $lt, $gt, or regex
          if (filterVal.$lt !== undefined) {
            filtered = filtered.filter(doc => doc[key] !== undefined && doc[key] < filterVal.$lt);
          }
          if (filterVal.$gt !== undefined) {
            filtered = filtered.filter(doc => doc[key] !== undefined && doc[key] > filterVal.$gt);
          }
          if (filterVal.$regex !== undefined) {
            const regex = new RegExp(filterVal.$regex, filterVal.$options || "i");
            filtered = filtered.filter(doc => doc[key] !== undefined && regex.test(doc[key]));
          }
        } else {
          // Simple property check
          filtered = filtered.filter(doc => doc[key] === filterVal);
        }
      });

      // Handle custom aggregation
      if (queryPlan.action === "count") {
        // Render a count statistic
        setSelectedResults([{ count: filtered.length }]);
      } else if (queryPlan.action === "aggregate" && queryPlan.aggregation) {
        const field = queryPlan.aggregation.field;
        const sum = filtered.reduce((total, doc) => total + (Number(doc[field]) || 0), 0);
        if (queryPlan.aggregation.type === "avg") {
          const avg = filtered.length > 0 ? sum / filtered.length : 0;
          setSelectedResults([{ average: Number(avg.toFixed(2)), count: filtered.length }]);
        } else {
          setSelectedResults([{ total: Number(sum.toFixed(2)), count: filtered.length }]);
        }
      } else {
        setSelectedResults(filtered);
      }

      const end = performance.now();
      const latency = Math.round(end - start);

      setQueryLatency(latency);
      setCurrentQueryPlan(queryPlan);

      // 4. Add AI response message
      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: queryPlan.explanation,
          queryPlan: queryPlan,
          latency: latency,
          recordsCount: filtered.length,
          timestamp: new Date()
        }
      ]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: "system",
          text: `⚠️ Query Execution Failed: Unable to execute generated query filter. Make sure database is seeded.`,
          timestamp: new Date()
        }
      ]);
    }
  };

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Generate simple chart metrics based on active results
  const renderChartData = () => {
    if (selectedResults.length === 0) return null;

    // 1. If it's a numeric aggregation result, show a simple KPI comparison card
    if (selectedResults.length === 1 && (selectedResults[0].total !== undefined || selectedResults[0].average !== undefined || selectedResults[0].count !== undefined)) {
      const item = selectedResults[0];
      const val = item.total ?? item.average ?? item.count;
      const label = item.total ? "Total Sum" : item.average ? "Average Value" : "Count Metric";

      return (
        <div className="flex flex-col items-center justify-center h-64 bg-zinc-900/40 rounded-2xl border border-zinc-800 p-8 shadow-inner">
          <Flame className="w-12 h-12 text-indigo-400 animate-pulse mb-3" />
          <span className="text-zinc-400 text-sm font-medium tracking-wide uppercase">{label}</span>
          <span className="text-5xl font-extrabold tracking-tight text-white mt-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            {item.total || item.average ? `$${val}` : val}
          </span>
          <p className="text-zinc-500 text-xs mt-3">Calculated offline instantly from {item.count || 1} source records</p>
        </div>
      );
    }

    // 2. Default Chart Generator (Visualizes price or categories/levels)
    let chartItems: { label: string; value: number }[] = [];

    if (activeCollection === "products") {
      chartItems = selectedResults.map(item => ({
        label: item.name || "Product",
        value: Number(item.price) || 0
      }));
    } else if (activeCollection === "users") {
      // Group by role
      const groups: Record<string, number> = {};
      selectedResults.forEach(item => {
        const r = item.role || "unknown";
        groups[r] = (groups[r] || 0) + 1;
      });
      chartItems = Object.entries(groups).map(([label, value]) => ({ label: `Role: ${label}`, value }));
    } else if (activeCollection === "orders") {
      chartItems = selectedResults.map(item => ({
        label: item.orderId || item.customerName || "Order",
        value: Number(item.amount) || 0
      }));
    } else if (activeCollection === "logs") {
      // Group by level
      const groups: Record<string, number> = {};
      selectedResults.forEach(item => {
        const l = item.level || "info";
        groups[l] = (groups[l] || 0) + 1;
      });
      chartItems = Object.entries(groups).map(([label, value]) => ({ label: `Level: ${label}`, value }));
    } else {
      // Todos: Group by completed status
      const completedCount = selectedResults.filter(t => t.completed).length;
      const pendingCount = selectedResults.length - completedCount;
      chartItems = [
        { label: "Completed", value: completedCount },
        { label: "Pending", value: pendingCount }
      ];
    }

    const maxVal = Math.max(...chartItems.map(i => i.value), 1);

    return (
      <div className="space-y-4 p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800">
        <h4 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          Metrics Visualization ({activeCollection})
        </h4>
        <div className="space-y-3">
          {chartItems.map((item, idx) => {
            const pct = (item.value / maxVal) * 100;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400 truncate max-w-[200px]">{item.label}</span>
                  <span className="text-zinc-200">{activeCollection === "products" || activeCollection === "orders" ? `$${item.value.toFixed(2)}` : item.value}</span>
                </div>
                <div className="w-full bg-zinc-950 h-3 rounded-full overflow-hidden border border-zinc-800/80">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Get active columns from selected data
  const getTableColumns = () => {
    if (selectedResults.length === 0) return [];
    // Extract unique keys excluding _id, id or system attributes
    const keys = new Set<string>();
    selectedResults.forEach(item => {
      Object.keys(item).forEach(k => {
        if (k !== "_id" && k !== "id") keys.add(k);
      });
    });
    return Array.from(keys);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      
      {/* LEFT SIDEBAR: Database Schema Explorer */}
      <aside className="w-80 bg-zinc-950 border-r border-zinc-800 flex flex-col justify-between shrink-0">
        <div className="p-5 flex flex-col overflow-y-auto h-full space-y-6">
          
          {/* Dashboard Header Brand */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                ZerithDB Explorer
              </h1>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Admin Console</span>
            </div>
          </div>

          {/* Sync Connection Status Banner */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isSynced ? "bg-green-500 animate-pulse" : "bg-orange-500"} shadow`} />
              <div>
                <p className="text-xs font-semibold text-zinc-300">P2P Synced Connection</p>
                <p className="text-[10px] text-zinc-500">{isSynced ? "wss://signal.zerithdb.dev" : "Local Database Mode"}</p>
              </div>
            </div>
            <button 
              title="Refresh connection"
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Seed Database button */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Dev Actions</h3>
            <button
              onClick={handleSeedDatabase}
              disabled={isSeeding}
              className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 border transition-all duration-300 ${
                hasSeeded 
                  ? "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:bg-zinc-900" 
                  : "bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white"
              }`}
            >
              {isSeeding ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Seeding collections...
                </>
              ) : hasSeeded ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  Database Seeded
                </>
              ) : (
                <>
                  <Flame className="w-3.5 h-3.5" />
                  Seed Sample Database
                </>
              )}
            </button>
          </div>

          {/* Database Collections List */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Collections</h3>
              <span className="text-[10px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-800">
                5 total
              </span>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "todos", label: "Todos", icon: ListTodo, color: "text-blue-400" },
                { name: "products", label: "Products", icon: ShoppingBag, color: "text-emerald-400" },
                { name: "users", label: "Users", icon: User, color: "text-amber-400" },
                { name: "orders", label: "Orders", icon: FileText, color: "text-purple-400" },
                { name: "logs", label: "System Logs", icon: Server, color: "text-rose-400" },
              ].map(col => {
                const count = dbData[col.name]?.length || 0;
                const isActive = activeCollection === col.name;
                const Icon = col.icon;
                return (
                  <button
                    key={col.name}
                    onClick={() => {
                      setActiveCollection(col.name);
                      setSelectedResults(dbData[col.name] || []);
                      setCurrentQueryPlan(null);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition-all ${
                      isActive 
                        ? "bg-zinc-900 border border-zinc-800 text-white shadow-sm" 
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${col.color}`} />
                      <span>{col.label}</span>
                    </div>
                    <span className="text-[10px] bg-zinc-950 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-800 font-semibold">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950 flex flex-col gap-1 text-[11px] text-zinc-500">
          <p>Local client-side index storage</p>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-zinc-400">ZerithDB SDK</span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>

      {/* MIDDLE PANEL: Chat-to-Query Natural Language Assistant */}
      <section className="flex-1 flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden">
        
        {/* Chat Header */}
        <header className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="font-bold text-sm text-zinc-100">AI Admin Copilot</h2>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 font-medium">
              Offline Natural Language Translator
            </span>
          </div>
          <button 
            onClick={() => setMessages([
              {
                id: "greet",
                sender: "ai",
                text: "Welcome to ZerithDB Chat-to-Query Admin Explorer! Ask me anything about your collections and I'll generate the queries instantly.",
                timestamp: new Date()
              }
            ])}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear Conversation
          </button>
        </header>

        {/* Chat Messages Timeline */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, index) => {
            const isUser = msg.sender === "user";
            const isSystem = msg.sender === "system";

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl px-4 py-2 text-[11px] text-zinc-400 text-center max-w-md">
                    {msg.text}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex gap-3.5 max-w-[85%] ${isUser ? "ml-auto flex-row-reverse" : ""}`}>
                {/* Sender Icon */}
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border text-xs font-semibold ${
                  isUser 
                    ? "bg-zinc-900 border-zinc-800 text-white" 
                    : "bg-indigo-600/15 border-indigo-500/25 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className="space-y-2">
                  <div className={`p-4 rounded-2xl text-xs leading-relaxed space-y-3 ${
                    isUser 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-zinc-900 border border-zinc-800/80 text-zinc-300 rounded-tl-none shadow-sm"
                  }`}>
                    <p className="whitespace-pre-line font-medium">{msg.text}</p>
                    
                    {/* Render DB statistics & Query Plan inside the chat bubble */}
                    {!isUser && msg.queryPlan && (
                      <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-2.5 text-[11px]">
                        <div className="flex items-center gap-1.5 text-zinc-400 font-semibold uppercase tracking-wider text-[9px]">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                          Generated Query Plan
                        </div>
                        <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 font-mono text-zinc-300 overflow-x-auto relative group/code">
                          <code className="text-[10px] block whitespace-pre-wrap">{msg.queryPlan.codeSnippet}</code>
                          <button
                            onClick={() => handleCopyCode(msg.queryPlan!.codeSnippet, index)}
                            className="absolute right-2 top-2 p-1 text-zinc-500 hover:text-zinc-300 bg-zinc-900 border border-zinc-800 rounded opacity-0 group-hover/code:opacity-100 transition-opacity"
                            title="Copy code"
                          >
                            {copiedIndex === index ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex items-center gap-4 text-zinc-500 font-medium">
                          <span>Latency: <strong className="text-zinc-400">{msg.latency}ms</strong></span>
                          <span>Documents found: <strong className="text-zinc-400">{msg.recordsCount}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <span className={`text-[10px] text-zinc-500 block ${isUser ? "text-right" : ""}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Preset Query Panels */}
        <div className="px-5 py-2 flex flex-wrap gap-1.5 shrink-0">
          {SAMPLE_QUERIES.map((query, idx) => {
            const Icon = query.icon;
            return (
              <button
                key={idx}
                onClick={() => runQuery(query.text)}
                className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 text-[11px] text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all"
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{query.text}</span>
              </button>
            );
          })}
        </div>

        {/* Input box */}
        <div className="p-5 border-t border-zinc-800/80 bg-zinc-950 shrink-0">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              runQuery(inputText);
            }} 
            className="flex gap-2.5"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask natural language question about database (e.g. 'show products under $50')..."
              className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs text-white placeholder-zinc-500 transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white px-4.5 rounded-xl flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(99,102,241,0.2)]"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>

      {/* RIGHT PANEL: Live Query Results Inspector */}
      <section className="w-[500px] bg-zinc-950 flex flex-col overflow-hidden shrink-0">
        
        {/* Results Header Tab Control */}
        <header className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h2 className="font-bold text-sm text-zinc-100">Live Preview</h2>
          </div>
          <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800/85">
            {[
              { id: "table", label: "Table", icon: TableIcon },
              { id: "chart", label: "Chart", icon: BarChart2 },
              { id: "json", label: "Raw JSON", icon: Code }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  activeTab === tab.id 
                    ? "bg-zinc-800 text-white shadow-sm" 
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* KPIs / Query Metrics bar */}
        <div className="px-5 py-3 border-b border-zinc-800/40 bg-zinc-950 flex items-center justify-between shrink-0 text-[11px] text-zinc-500 font-medium">
          <div className="flex items-center gap-2">
            <span>Query Collection:</span>
            <span className="bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 font-bold">
              {activeCollection}
            </span>
          </div>
          {queryLatency !== null && (
            <div className="flex items-center gap-4">
              <span>Latency: <strong className="text-zinc-400">{queryLatency}ms</strong></span>
              <span>Records: <strong className="text-zinc-400">{selectedResults.length}</strong></span>
            </div>
          )}
        </div>

        {/* Viewport for Active Tab */}
        <div className="flex-1 overflow-auto p-5">
          {selectedResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-zinc-800/80 rounded-2xl p-6">
              <Database className="w-8 h-8 text-zinc-600 mb-3 animate-pulse" />
              <h3 className="font-semibold text-zinc-400 text-xs">No Records Found</h3>
              <p className="text-zinc-600 text-[11px] max-w-[250px] mt-1">
                The database did not return any matching documents for the current collection/filter state.
              </p>
            </div>
          ) : (
            <>
              {/* TABLE VIEW */}
              {activeTab === "table" && (
                <div className="border border-zinc-850 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead className="bg-zinc-900 border-b border-zinc-850 text-zinc-400 font-semibold tracking-wider uppercase text-[9px]">
                        <tr>
                          {getTableColumns().map(col => (
                            <th key={col} className="px-4 py-3 font-bold">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850">
                        {selectedResults.map((item, idx) => (
                          <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                            {getTableColumns().map(col => {
                              const val = item[col];
                              let renderedVal = String(val);

                              if (typeof val === "boolean") {
                                renderedVal = val ? "✅ Yes" : "❌ No";
                              } else if (col === "price" || col === "amount") {
                                renderedVal = `$${Number(val).toFixed(2)}`;
                              }

                              return (
                                <td key={col} className="px-4 py-3 text-zinc-300 font-medium">
                                  {renderedVal}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CHART VIEW */}
              {activeTab === "chart" && renderChartData()}

              {/* JSON VIEW */}
              {activeTab === "json" && (
                <div className="relative group">
                  <pre className="p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl font-mono text-[10px] text-indigo-300 overflow-x-auto shadow-inner leading-relaxed">
                    {JSON.stringify(selectedResults, null, 2)}
                  </pre>
                  <button
                    onClick={() => handleCopyCode(JSON.stringify(selectedResults, null, 2), 999)}
                    className="absolute right-3 top-3 p-1.5 text-zinc-500 hover:text-zinc-300 bg-zinc-900 border border-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy full JSON"
                  >
                    {copiedIndex === 999 ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Collection schema details footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950 shrink-0">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            Collection Schema Reference
          </div>
          <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-3.5 text-[10px] space-y-1">
            {activeCollection === "todos" && (
              <>
                <div className="flex justify-between">
                  <code className="text-blue-400 font-semibold">text</code>
                  <span className="text-zinc-500 font-medium">String (e.g. &quot;Implement scaling features&quot;)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-blue-400 font-semibold">completed</code>
                  <span className="text-zinc-500 font-medium">Boolean (true / false)</span>
                </div>
              </>
            )}
            {activeCollection === "products" && (
              <>
                <div className="flex justify-between">
                  <code className="text-emerald-400 font-semibold">name</code>
                  <span className="text-zinc-500">String (e.g. &quot;Mechanical Keyboard&quot;)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-emerald-400 font-semibold">category</code>
                  <span className="text-zinc-500">String (Electronics, Home, Books)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-emerald-400 font-semibold">price</code>
                  <span className="text-zinc-500">Number (e.g. 149.50)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-emerald-400 font-semibold">stock</code>
                  <span className="text-zinc-500">Number (e.g. 45)</span>
                </div>
              </>
            )}
            {activeCollection === "users" && (
              <>
                <div className="flex justify-between">
                  <code className="text-amber-400 font-semibold">name</code>
                  <span className="text-zinc-500">String (e.g. &quot;Alex Rivera&quot;)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-amber-400 font-semibold">role</code>
                  <span className="text-zinc-500">String (admin, moderator, customer)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-amber-400 font-semibold">active</code>
                  <span className="text-zinc-500">Boolean (true / false)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-amber-400 font-semibold">email</code>
                  <span className="text-zinc-500">String (e.g. &quot;alex@zerithdb.dev&quot;)</span>
                </div>
              </>
            )}
            {activeCollection === "orders" && (
              <>
                <div className="flex justify-between">
                  <code className="text-purple-400 font-semibold">orderId</code>
                  <span className="text-zinc-500">String (e.g. &quot;Z-1001&quot;)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-purple-400 font-semibold">customerName</code>
                  <span className="text-zinc-500">String (e.g. &quot;Diana Prince&quot;)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-purple-400 font-semibold">amount</code>
                  <span className="text-zinc-500">Number (e.g. 119.98)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-purple-400 font-semibold">status</code>
                  <span className="text-zinc-500">String (delivered, pending, cancelled)</span>
                </div>
              </>
            )}
            {activeCollection === "logs" && (
              <>
                <div className="flex justify-between">
                  <code className="text-rose-400 font-semibold">text</code>
                  <span className="text-zinc-500">String (e.g. &quot;Sync token mismatch&quot;)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-rose-400 font-semibold">level</code>
                  <span className="text-zinc-500">String (info, warn, error)</span>
                </div>
                <div className="flex justify-between">
                  <code className="text-rose-400 font-semibold">module</code>
                  <span className="text-zinc-500">String (sync, db, core)</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
