"use client";

import { Database, Laptop, RefreshCcw } from "lucide-react";

export default function AnimatedDiagram() {
  return (
    <div className="w-full max-w-4xl mx-auto py-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 px-4">
      {/* Client 1 */}
      <div className="flex flex-col items-center z-10 w-48">
        <div className="w-24 h-24 bg-white rounded-2xl shadow-xl border border-gray-200 flex items-center justify-center relative mb-4">
          <Laptop className="w-10 h-10 text-foreground" />
          <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <p className="font-semibold text-foreground">Client A</p>
        <p className="text-xs text-muted-foreground">IndexedDB</p>
      </div>

      {/* Network / CRDT Middle */}
      <div className="flex-1 flex flex-col items-center relative min-h-[160px] justify-center w-full">
        {/* Animated Line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2 overflow-hidden">
          <div
            className="h-full w-1/3 bg-blue-500 animate-[translate_2s_linear_infinite]"
            style={{ animationName: "slide" }}
          ></div>
        </div>

        <div className="bg-white p-4 rounded-full shadow-lg border border-gray-200 z-10 flex flex-col items-center justify-center">
          <RefreshCcw className="w-8 h-8 text-blue-600 mb-2 animate-[spin_4s_linear_infinite]" />
          <span className="text-xs font-bold text-foreground px-2 py-1 bg-muted rounded-md">
            CRDT Merge
          </span>
        </div>
        <p className="text-sm font-medium text-blue-600 mt-4 bg-white px-3 py-1 rounded-full border border-blue-100 shadow-sm">
          WebRTC Data Channel
        </p>

        {/* Global animation styles injected here since arbitrary values in tailwind can be tricky for keyframes */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `,
          }}
        />
      </div>

      {/* Client 2 */}
      <div className="flex flex-col items-center z-10 w-48">
        <div className="w-24 h-24 bg-white rounded-2xl shadow-xl border border-gray-200 flex items-center justify-center relative mb-4">
          <Laptop className="w-10 h-10 text-foreground" />
          <div className="absolute -bottom-3 -left-3 w-10 h-10 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <p className="font-semibold text-foreground">Client B</p>
        <p className="text-xs text-muted-foreground">IndexedDB</p>
      </div>
    </div>
  );
}
