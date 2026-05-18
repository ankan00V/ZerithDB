"use client";

import { useEffect,useRef } from "react";
import { usePathname } from "next/navigation";
import { zerithApp } from "./zerith";

export function useNavTracking() {
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    const trackNavigation = async () => {
        const currentPathname = pathname;
        const prevPathname = prevPathnameRef.current;

        if(prevPathname && prevPathname !== currentPathname) {
            // Track the navigation event
            await zerithApp.db("navEvents").insert({
                from: prevPathname,
                to: currentPathname,
                timestamp: Date.now(),
                sessionId: typeof window !== "undefined" 
                    ? sessionStorage.getItem("sessionId") || "unknown"
                    : "unknown",
                });
        }
        prevPathnameRef.current = currentPathname;
    };

    trackNavigation();
  }, [pathname]);
}