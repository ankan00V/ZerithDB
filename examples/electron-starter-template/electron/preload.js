const { contextBridge, ipcRenderer } = require("electron");

// Expose a minimal, safe API to the renderer process.
// Never expose ipcRenderer directly — only the specific channels you need.
contextBridge.exposeInMainWorld("electron", {
  // The renderer can subscribe to OS network-change events forwarded
  // from main.js. ZerithDB handles reconnect automatically; this just
  // lets the UI show an accurate status badge immediately.
  onNetworkChange: (cb) => ipcRenderer.on("network-change", (_event, isOnline) => cb(isOnline)),

  // Remove the listener when the component unmounts.
  offNetworkChange: (cb) => ipcRenderer.removeListener("network-change", cb),
});
