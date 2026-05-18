/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Laptop,
  Save,
  Database,
  ArrowRightLeft,
  Copy,
  Check,
  Fingerprint,
  Shield,
  KeyRound,
  Activity,
  Lock,
  ShieldAlert,
} from "lucide-react";

type ClientId = "A" | "B";

type Note = {
  id: string;
  text: string;
  senderId: ClientId;
  timestamp: number;
};

const formatTimestamp = (timestamp: number) => {
  return new Date(timestamp).toISOString().slice(11, 19);
};

export default function PlaygroundPage() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncCount, setSyncCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());

  // Biometric Enclave Simulator States
  const [biometricHardwareAvailable, setBiometricHardwareAvailable] = useState(true);
  const [requireBiometricWrite, setRequireBiometricWrite] = useState(true);
  const [requireBiometricSync, setRequireBiometricSync] = useState(true);
  const sessionKeyFingerprint =
    "3059301306072a8648ce3d020106082a8648ce3d03010703420004ad79e88bf7e4...";

  // Biometric Prompt Modal States
  const [showModal, setShowModal] = useState(false);
  const [modalReason, setModalReason] = useState("");
  const [modalResolve, setModalResolve] = useState<((val: boolean) => void) | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  // Real-time Audit Logs
  const [logs, setLogs] = useState<string[]>([
    "Initialized ZerithDB Secure Local SDK v0.1.0.",
    "Generated non-exportable ECDSA P-256 session keypair bound to Secure Enclave (extractable: false) 🔑",
    "Hardware-bound public key exported to SPKI: 3059301306072a8648ce3d020106082a8648ce3d030107...",
  ]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 12));
  };

  // Initialize clients
  const [clients, setClients] = useState<Client[]>(() =>
    CLIENTS_CONFIG.map((client) => ({
      ...client,
      notes: [dummyMessage],
      input: "",
      identity: "",
    }))
  );

  // Simulate DB initialization and generate identities
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setIsPeerConnected(true);
    }, 1500);

    (async () => {
      const newClients = await Promise.all(
        clients.map(async (c) => ({
          ...c,
          identity: await generateMockDID(),
        }))
      );
      setClients(newClients);
    })();

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOnline) {
      setIsPeerConnected(false);
      return;
    }

    setIsPeerConnected(false);
    const timer = setTimeout(() => setIsPeerConnected(true), 1000);
    return () => clearTimeout(timer);
  }, [isOnline]);

  const peerStatus = !isOnline
    ? "offline"
    : isLoading || !isPeerConnected
      ? "connecting"
      : "connected";

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = toastTimeouts.current;
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);

    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimeouts.current.delete(timeout);
    }, 3000);

    toastTimeouts.current.add(timeout);
  };

  const copyToClipboard = async (text: string) => {
    if (!text.trim()) {
      showToast("Failed to copy", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard!", "success");
      addLog("Copied public identity DID key to clipboard.");
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  // Sync logic simulation with cryptographic verify
  useEffect(() => {
    if (!isOnline) return;

    // Merge all notes from all clients
    const allNotes = clients.flatMap((c) => c.notes);
    const merged = allNotes.reduce((acc, curr) => {
      const existing = acc.find((n) => n.id === curr.id);
      if (!existing) {
        acc.push(curr);
      } else if (curr.timestamp > existing.timestamp) {
        existing.text = curr.text;
        existing.timestamp = curr.timestamp;
        existing.senderId = curr.senderId;
      }
      return acc;
    }, [] as Note[]);

    // Update all clients with merged data if changed
    let hasChanges = false;
    const newClients = clients.map((client) => {
      if (JSON.stringify(client.notes) !== JSON.stringify(merged)) {
        hasChanges = true;
        return { ...client, notes: merged };
      }
      return client;
    });

    if (hasChanges) {
      setClients(newClients);
      setSyncCount((prev) => prev + 1);
      if (requireBiometricSync) {
        addLog("WebRTC Peer sync signature verification SUCCESSFUL (ECDSA SPKI match).");
      }
    }
  }, [clients, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Intercept write operations with biometric prompts
  const handleAddNote = async (clientId: ClientId, text: string) => {
    if (!text.trim()) return;

    if (requireBiometricWrite) {
      addLog(`DB Write intercept: Requesting authorization for "Browser ${clientId}"...`);
      const reason = `Authorize sensitive database operation: Write document on Collection "notes"`;
      const authorized = await triggerBiometricPrompt(reason);

      if (!authorized) {
        showToast("Database write aborted: Authorization failed.", "error");
        addLog(`❌ DB Write authorization REJECTED for Browser ${clientId}.`);
        return;
      }
    }

    const newNote: Note = {
      id: Math.random().toString(36).substring(7),
      text,
      timestamp: Date.now(),
      senderId: clientId,
    };

    setClients((prev) =>
      prev.map((client) =>
        client.id === clientId
          ? { ...client, notes: [...client.notes, newNote], input: "" }
          : client
      )
    );

    showToast("Document written to local IndexedDB!", "success");
    addLog(`✅ DB Write SUCCESS: Document inserted into local IndexedDB.`);

    if (requireBiometricSync) {
      addLog(`📡 Sync Engine: Signed outbound WebRTC payload using non-exportable session key.`);
    }
  };

  // Trigger interactive biometric modal or fallback PIN flow
  const triggerBiometricPrompt = (reason: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalReason(reason);
      setModalResolve(() => resolve);
      setIsScanning(false);
      setScanSuccess(false);
      setPinInput("");
      setPinError("");
      setShowModal(true);
    });
  };

  const handleSimulateScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScanSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        if (modalResolve) modalResolve(true);
      }, 800);
    }, 1200);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === "1234") {
      setShowModal(false);
      if (modalResolve) modalResolve(true);
    } else {
      setPinError("Invalid security PIN. Access denied.");
    }
  };

  const handleCancelModal = () => {
    setShowModal(false);
    if (modalResolve) modalResolve(false);
  };

  const updateInput = (clientId: ClientId, value: string) => {
    setClients((prev) =>
      prev.map((client) => (client.id === clientId ? { ...client, input: value } : client))
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden text-gray-900">
      {/* HEADER - Fixed at top */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 h-16 flex items-center justify-between fixed top-0 left-0 right-0 z-40 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 md:gap-4 flex-wrap min-w-0">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1.5 text-sm font-medium shrink-0 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            <span className="truncate">Back</span>
          </Link>
          <div className="h-4 w-px bg-gray-200 shrink-0"></div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 flex items-center justify-center shrink-0">
              <Fingerprint className="w-6 h-6 text-black" />
            </div>
            <span className="font-semibold text-gray-900 text-base md:text-lg tracking-tight truncate">
              ZerithDB Enclave Security
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 flex-wrap md:flex-nowrap justify-end min-w-0">
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-full shrink-0">
            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 text-black animate-pulse" />
            <span className="truncate">CRDT Syncs: {syncCount}</span>
          </div>

          <div
            className={`hidden md:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${
              peerStatus === "connected"
                ? "bg-green-100 text-green-800"
                : peerStatus === "connecting"
                  ? "bg-yellow-100 text-yellow-800 animate-pulse"
                  : "bg-red-100 text-red-800"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                peerStatus === "connected"
                  ? "bg-green-600 animate-ping"
                  : peerStatus === "connecting"
                    ? "bg-yellow-600 animate-pulse"
                    : "bg-red-600"
              }`}
            />
            <span className="truncate">
              {peerStatus === "connected"
                ? "Secured WebRTC Connected"
                : peerStatus === "connecting"
                  ? "Establishing..."
                  : "Offline"}
            </span>
          </div>

          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border shrink-0 ${
              isOnline
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            }`}
          >
            {isOnline ? (
              <Wifi className="w-4 h-4 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 shrink-0" />
            )}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
            <span className="sm:hidden">{isOnline ? "Online" : "Offline"}</span>
          </button>
        </div>
      </header>

      {/* Spacer to prevent content from hiding under fixed header */}
      <div className="h-16"></div>

      {/* TITLE SECTION */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 pt-6 md:pt-8 pb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
          Biometric-Bound Session Keys <Lock className="w-6 h-6 text-black" />
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Non-exportable cryptographic session keys tied securely to the hardware enclave.
        </p>
      </div>

      {/* SECURITY METADATA & ENCLAVE SIMULATION DASHBOARD */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 grid md:grid-cols-3 gap-6 my-4">
        {/* Enclave Settings */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-black" /> Enclave Settings
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor="security-hardware-toggle"
                    className="text-xs font-semibold text-gray-700 block"
                  >
                    Biometric Hardware Support
                  </label>
                  <span className="text-[10px] text-gray-400">Simulate TouchID/FaceID Enclave</span>
                </div>
                <button
                  id="security-hardware-toggle"
                  onClick={() => {
                    setBiometricHardwareAvailable(!biometricHardwareAvailable);
                    addLog(
                      `Hardware toggle: Simulated biometrics ${!biometricHardwareAvailable ? "ENABLED" : "DISABLED (PIN Fallback Active)"}.`
                    );
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    biometricHardwareAvailable ? "bg-black" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      biometricHardwareAvailable ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div>
                  <label
                    htmlFor="security-policy-write-toggle"
                    className="text-xs font-semibold text-gray-700 block"
                  >
                    DB Operations Policy
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Require fingerprint prompt on write
                  </span>
                </div>
                <button
                  id="security-policy-write-toggle"
                  onClick={() => {
                    setRequireBiometricWrite(!requireBiometricWrite);
                    addLog(
                      `DB policy toggle: Biometric write verification ${!requireBiometricWrite ? "ACTIVE" : "INACTIVE"}.`
                    );
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    requireBiometricWrite ? "bg-black" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      requireBiometricWrite ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div>
                  <label
                    htmlFor="security-policy-sync-toggle"
                    className="text-xs font-semibold text-gray-700 block"
                  >
                    WebRTC Payload Signing
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Sign outgoing replication packets
                  </span>
                </div>
                <button
                  id="security-policy-sync-toggle"
                  onClick={() => {
                    setRequireBiometricSync(!requireBiometricSync);
                    addLog(
                      `WebRTC policy toggle: Outbound payload signing ${!requireBiometricSync ? "ACTIVE" : "INACTIVE"}.`
                    );
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    requireBiometricSync ? "bg-black" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      requireBiometricSync ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Cryptographic Credentials */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-black" /> Session Credentials
            </h2>
            <div className="space-y-3 font-mono text-[11px]">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-400">Key Type</span>
                <span className="font-semibold text-gray-800">ECDSA P-256</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-400">Non-Exportable</span>
                <span className="font-bold text-green-600 flex items-center gap-1">
                  Enforced (extractable: false) <Lock className="w-3 h-3" />
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-400">Hardware Bound</span>
                <span className="font-semibold text-gray-800">True (Secure Enclave)</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-gray-400">SPKI Public Key Digest</span>
                <span className="text-gray-500 break-all bg-gray-50 p-2 rounded-lg border border-gray-100 font-mono leading-relaxed select-all">
                  {sessionKeyFingerprint}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Audit Logs */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between h-[230px] md:h-auto">
          <div className="flex flex-col h-full">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-black" /> Cryptographic Audit Log
            </h2>
            <div className="flex-1 bg-gray-900 rounded-xl p-3 font-mono text-[10px] text-green-400 overflow-y-auto space-y-1.5 max-h-[160px] md:max-h-[180px] shadow-inner select-none leading-relaxed">
              {logs.map((log, index) => (
                <div key={index} className="break-words">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN PLAYGROUND */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid md:grid-cols-2 gap-8 items-start mt-8">
        {/* CLIENT A */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[600px]">
          <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-2 text-white">
              <Laptop className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold tracking-wide">Browser A (Alice)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <Database className="w-3.5 h-3.5" /> IndexedDB Active
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {clientA.length === 0 ? (
              <div className="text-center text-gray-400 mt-20 text-sm">
                No documents. Type below to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {clientA.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <p className="text-gray-800">{note.text}</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wider font-mono">
                      ID: {note.id} • {formatTimestamp(note.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addNote("A", inputA);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={inputA}
                onChange={(e) => setInputA(e.target.value)}
                placeholder="Type a message offline/online..."
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </form>
          </div>
        </div>

        {/* CLIENT B */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[600px]">
          <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-2 text-white">
              <Laptop className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold tracking-wide">Browser B (Bob)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <Database className="w-3.5 h-3.5" /> IndexedDB Active
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {clientB.length === 0 ? (
              <div className="text-center text-gray-400 mt-20 text-sm">
                No documents. Type below to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {clientB.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <p className="text-gray-800">{note.text}</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wider font-mono">
                      ID: {note.id} • {formatTimestamp(note.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addNote("B", inputB);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={inputB}
                onChange={(e) => setInputB(e.target.value)}
                placeholder="Type a message offline/online..."
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* INFO FOOTER */}
      <div className="max-w-3xl mx-auto text-center pb-12 px-4 md:px-6 overflow-x-hidden">
        <h3 className="font-semibold text-gray-900 mb-2">How to test the Playground:</h3>
        <ul className="text-sm text-gray-500 flex flex-col gap-2 break-words">
          {INSTRUCTIONS.map((instruction, index) => (
            <li key={index} className="break-words">
              {index + 1}. {instruction}
            </li>
          ))}
        </ul>
      </div>

      {/* BIOMETRIC PROMPT & SECURE PIN FALLBACK DIALOG OVERLAY */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            {biometricHardwareAvailable ? (
              /* FaceID / TouchID scan interface */
              <div className="w-full flex flex-col items-center">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    scanSuccess
                      ? "bg-green-500"
                      : isScanning
                        ? "bg-black animate-pulse"
                        : "bg-black/5"
                  } mb-6 transition-all duration-300`}
                >
                  <Fingerprint
                    className={`w-10 h-10 ${
                      scanSuccess
                        ? "text-white scale-110"
                        : isScanning
                          ? "text-white animate-bounce"
                          : "text-black"
                    } transition-all`}
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  {scanSuccess ? "Biometric Verification Success" : "Secure Enclave Request"}
                </h3>
                <p className="text-xs text-gray-500 mt-2 max-w-sm px-4">{modalReason}</p>
                <div className="mt-6 flex flex-col gap-2 w-full">
                  {!scanSuccess && (
                    <button
                      id="biometric-scan-trigger"
                      onClick={handleSimulateScan}
                      disabled={isScanning}
                      className="bg-black text-white py-3 rounded-2xl text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isScanning ? "Verifying fingerprint..." : "Simulate Fingerprint Scan"}
                    </button>
                  )}
                  <button
                    id="biometric-scan-cancel"
                    onClick={handleCancelModal}
                    className="bg-gray-100 text-gray-700 py-3 rounded-2xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                  >
                    Cancel Action
                  </button>
                </div>
              </div>
            ) : (
              /* Secure PIN Fallback interface */
              <div className="w-full flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center mb-6">
                  <ShieldAlert className="w-8 h-8 text-yellow-800" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Hardware Unavailable</h3>
                <p className="text-xs text-gray-500 mt-2 px-4 leading-relaxed">
                  TouchID/FaceID enclave is currently locked or unavailable. Please enter your
                  secure PIN below to authorize the database operation.
                </p>
                <div className="bg-yellow-50 border border-yellow-100 text-yellow-800 text-[10px] font-semibold px-3 py-1.5 rounded-lg mt-3">
                  Simulated Security PIN is{" "}
                  <code className="bg-yellow-100 px-1 py-0.5 rounded font-mono">1234</code>
                </div>

                <form onSubmit={handlePinSubmit} className="mt-6 w-full flex flex-col gap-4">
                  <div className="w-full">
                    <label htmlFor="biometric-pin-input" className="sr-only">
                      Enter secure security PIN
                    </label>
                    <input
                      id="biometric-pin-input"
                      type="password"
                      maxLength={4}
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value);
                        setPinError("");
                      }}
                      placeholder="••••"
                      className="w-full bg-gray-50 border border-gray-200 text-center font-mono text-xl tracking-[0.5em] py-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                      autoFocus
                    />
                    {pinError && (
                      <span className="text-xs text-red-600 font-semibold mt-2 block animate-pulse">
                        {pinError}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    <button
                      id="biometric-pin-submit"
                      type="submit"
                      disabled={pinInput.length < 4}
                      className="bg-black text-white py-3 rounded-2xl text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                    >
                      Authorize Action
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelModal}
                      className="bg-gray-100 text-gray-700 py-3 rounded-2xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                    >
                      Cancel Action
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div
        className="fixed bottom-4 md:bottom-6 right-4 md:right-6 flex flex-col gap-2 pointer-events-none max-w-[calc(100%-2rem)] md:max-w-md z-40"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto break-words min-w-0 ${
              toast.type === "success"
                ? "bg-black text-white"
                : "bg-red-100 text-red-900 border border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="w-4 h-4 text-green-400 shrink-0" />
            ) : (
              <span className="text-lg shrink-0">✕</span>
            )}
            <span className="text-sm font-medium truncate">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  isLoading,
  onAddNote,
  onUpdateInput,
  onCopyIdentity,
}: {
  client: Client;
  isLoading: boolean;
  onAddNote: (id: ClientId, text: string) => void;
  onUpdateInput: (id: ClientId, value: string) => void;
  onCopyIdentity: (text: string) => void;
}) {
  const isBlue = client.color === "blue";
  const textColor = isBlue ? "text-blue-400" : "text-purple-400";
  const bgColor = isBlue ? "bg-blue-50" : "bg-purple-50";
  const borderColor = isBlue ? "border-blue-100" : "border-purple-100";
  const identityBorder = isBlue ? "border-blue-200" : "border-purple-200";
  const identityText = isBlue ? "text-blue-700" : "text-purple-700";
  const identityIcon = isBlue
    ? "text-blue-500 hover:text-blue-700 hover:bg-blue-100"
    : "text-purple-500 hover:text-purple-700 hover:bg-purple-100";
  const focusRingColor = isBlue
    ? "focus:ring-blue-500/20 focus:border-blue-500"
    : "focus:ring-purple-500/20 focus:border-purple-500";

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[520px] max-h-[700px]">
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2 text-white">
          <Laptop className={`w-4 h-4 ${textColor}`} />
          <span className="text-sm font-semibold tracking-wide">
            Browser {client.id} ({client.name})
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
          <Database className="w-3.5 h-3.5" /> IndexedDB Active
        </div>
      </div>

      {/* Identity Display */}
      <div className={`${bgColor} px-4 py-3 border-b ${borderColor}`}>
        <div
          className={`text-xs font-semibold ${isBlue ? "text-blue-900" : "text-purple-900"} mb-2 uppercase tracking-wide`}
        >
          Identity (Ed25519 Mock)
        </div>
        <div
          className={`flex items-center gap-2 bg-white rounded-lg px-3 py-2 border ${identityBorder}`}
        >
          <code className={`text-xs ${identityText} font-mono flex-1 truncate`}>
            {client.identity || "(generating...)"}
          </code>
          <button
            id={`copy-identity-${client.id}`}
            onClick={() => onCopyIdentity(client.identity)}
            disabled={!client.identity}
            className={`ml-2 p-1.5 ${identityIcon} disabled:text-gray-400 disabled:hover:bg-transparent rounded transition-colors flex-shrink-0`}
            title={client.identity ? "Copy public key" : "Loading..."}
            aria-label={`Copy Browser ${client.id} public key`}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : client.notes.length === 0 ? (
          <div className="text-center text-gray-400 mt-20 text-sm">
            No documents. Type below to create one.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {client.notes.map((note) => (
              <div
                key={note.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <p className="text-gray-800 wrap-break-word whitespace-pre-wrap">{note.text}</p>
                <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wider font-mono">
                  ID: {note.id} • {new Date(note.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAddNote(client.id, client.input);
          }}
          className="flex gap-2"
        >
          <input
            id={`client-note-input-${client.id}`}
            type="text"
            value={client.input}
            onChange={(e) => onUpdateInput(client.id, e.target.value)}
            placeholder="Type a message offline/online..."
            className={`flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all ${focusRingColor}`}
          />
          <button
            id={`client-note-submit-${client.id}`}
            type="submit"
            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </form>
      </div>
    </div>
  );
}
