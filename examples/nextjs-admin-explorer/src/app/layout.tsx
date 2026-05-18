import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZerithDB Chat-to-Query Admin Explorer",
  description: "Next.js Admin Explorer with offline Chat-to-Query Natural Language AI interface for ZerithDB.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-zinc-950 text-zinc-50 min-h-screen selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
