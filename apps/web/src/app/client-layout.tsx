"use client";

import { useNavTracking } from "@/lib/useNavTracking";
    
export function ClientLayout({children}: {children: React.ReactNode}) {
    useNavTracking();
    return <>{children}</>;
}