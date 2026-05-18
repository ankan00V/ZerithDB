import React, { createContext, useState, useEffect, useRef } from "react";
import { createApp } from "zerithdb-sdk";
import type { ZerithDBApp, ZerithDBConfig } from "zerithdb-sdk";

export const ZerithContext = createContext<ZerithDBApp | null>(null);

export interface ZerithProviderProps {
  config: ZerithDBConfig;
  children: React.ReactNode;
}

/**
 * Global provider for ZerithDB.
 * Initializes the P2P client and makes it available via hooks.
 * Disposes the previous client on config change or unmount to prevent
 * memory/connection leaks.
 *
 * Fix (BUG-01): Previously called createApp() twice on mount — once in the
 * useState() factory and again inside the useEffect(). The first instance was
 * never disposed, leaking an IndexedDB handle and a WebSocket connection.
 *
 * The fix uses a ref to capture the app created during the initial render.
 * The effect reuses that same instance (no double-create), registers the
 * cleanup, and replaces it cleanly whenever `config` changes.
 */
export const ZerithProvider: React.FC<ZerithProviderProps> = ({ config, children }) => {
  // Serialize config to a stable string so the effect only re-runs on real changes.
  const configStr = JSON.stringify(config);

  // Create the very first app instance synchronously during initial render.
  // useRef ensures this runs exactly once — unlike useState, it never re-runs
  // on re-renders, so there is no risk of creating a second app.
  const initialApp = useRef<ZerithDBApp | null>(null);
  if (initialApp.current === null) {
    initialApp.current = createApp(config);
  }

  // client drives the context value. It starts as the ref-captured initial app,
  // so children always have a valid, non-null instance from the very first render.
  const [client, setClient] = useState<ZerithDBApp>(() => initialApp.current!);

  useEffect(() => {
    // On initial mount: the app already exists in the ref — reuse it.
    // On subsequent config changes: create a fresh app and replace the old one.
    let app: ZerithDBApp;

    if (initialApp.current !== null) {
      // First run — consume the pre-created app and clear the ref so future
      // config changes take the else-branch below.
      app = initialApp.current;
      initialApp.current = null;
    } else {
      // Config changed — create a new instance.
      app = createApp(config);
      setClient(app);
    }

    // Dispose on config change or unmount — always exactly one cleanup per app.
    return () => {
      void app.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configStr]);

  return <ZerithContext.Provider value={client}>{children}</ZerithContext.Provider>;
};
