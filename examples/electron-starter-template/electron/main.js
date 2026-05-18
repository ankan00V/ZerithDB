const { app, BrowserWindow, ipcMain, net } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      partition: "persist:zerithdb",
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  const isDev = !app.isPackaged;

  if (isDev) {
    // Point at Vite dev server in development.
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    // Load the built renderer in production.
    win.loadFile(path.join(__dirname, "../dist/index.html"));
    win.webContents.openDevTools();
  }

  // Forward OS-level online/offline events to the renderer.
  // net.isOnline() is the correct Electron/Node API — navigator is browser-only.
  const sendNetworkStatus = () => {
    win.webContents.send("network-change", net.isOnline());
  };
  app.on("browser-window-focus", sendNetworkStatus);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
