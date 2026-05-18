module.exports = {
  appId: "com.yourname.my-notes-app",
  productName: "My Notes App",
  directories: {
    output: "dist-electron", // packaged installers land here
  },
  files: [
    "dist/**/*", // bundled Vite renderer
    "electron/**/*", // main process + preload
  ],
  mac: {
    target: "dmg",
  },
  win: {
    target: "nsis",
  },
  linux: {
    target: "AppImage",
  },
};
