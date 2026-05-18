import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClientLayout } from "./client-layout";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ToasterProvider from "@/components/ToasterProvider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ZerithDB — Build apps with zero backend",
  description:
    "Local-first, peer-to-peer, CRDT-powered browser-native database platform. Build full-stack apps with ZERO backend. The browser is the server.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-white text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900">
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
