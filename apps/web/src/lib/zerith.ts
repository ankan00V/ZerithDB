import { createApp } from "zerithdb-sdk";

export const zerithApp = createApp({
  appId: "my-app-unique-id",

  sync: {
    signalingUrl: "wss://signal.zerithdb.dev",
  },
});

if (typeof window !== "undefined") {
  // Expose for debugging in the browser console (development only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__zerithApp = zerithApp;
}