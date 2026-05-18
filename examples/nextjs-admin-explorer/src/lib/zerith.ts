import { createApp, type ZerithDBApp } from "zerithdb-sdk";

let app: ZerithDBApp | null = null;

/**
 * Returns a singleton instance of the ZerithDB application.
 * Ensures the client is only initialized in the browser to avoid SSR errors.
 */
export function getZerithApp(): ZerithDBApp {
  if (typeof window === "undefined") {
    throw new Error("ZerithDB SDK can only be used in the browser.");
  }

  if (!app) {
    app = createApp({
      appId: "nextjs-admin-explorer",
      sync: {
        signalingUrl: "wss://signal.zerithdb.dev",
      },
    });

    // Enable sync by default
    app.sync.enable();
  }

  return app;
}
