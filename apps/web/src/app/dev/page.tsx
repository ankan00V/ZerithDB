"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";

type NavEvent = {
  _id?: string;
  from?: string;
  to?: string;
  timestamp?: number;
  sessionId?: string;
};

export default function DevNavPage() {
  const [events, setEvents] = useState<NavEvent[] | null>(null);
  const [transitions, setTransitions] = useState<Record<string, Record<string, number>> | null>(null);
  const [probabilities, setProbabilities] = useState<Record<string, Record<string, number>> | null>(null);
  const [currentState, setCurrentState] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  // Helper types for the minimal app surface we call from the dev page
  type SimpleCollection = {
    find: (filter?: Record<string, unknown>) => Promise<NavEvent[]>;
    clearAll?: () => Promise<void>;
  };

  type SimpleApp = {
    db: (name: string) => SimpleCollection;
  };

  const formatRelativeTime = (timestamp: number) => {
    const delta = Math.round((now - timestamp) / 1000);
    if (delta < 60) return `${delta}s ago`;
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
  };

  const buildTransitionEntries = () => {
    if (!transitions) return [] as Array<{ from: string; to: string; count: number }>;
    return Object.entries(transitions).flatMap(([from, row]) =>
      Object.entries(row).map(([to, count]) => ({ from, to, count }))
    );
  };

  const fetchEvents = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const app = (window as unknown as { __zerithApp?: SimpleApp }).__zerithApp;
      if (!app) {
        setError("window.__zerithApp is not available. Ensure dev server is running and reload.");
        setEvents([]);
        return;
      }

      const ev: NavEvent[] = await app.db("navEvents").find({});
      const sorted = ev.slice().sort((a, b) => {
        const ta = a.timestamp ?? 0;
        const tb = b.timestamp ?? 0;
        return tb - ta;
      });
      setEvents(sorted || []);

      const t: Record<string, Record<string, number>> = {};
      for (const e of sorted) {
        const from = e.from ?? "<root>";
        const to = e.to ?? "<unknown>";
        t[from] = t[from] || {};
        t[from][to] = (t[from][to] || 0) + 1;
      }
      setTransitions(t);
      setProbabilities(null); // reset trained probabilities until user trains
      setLastUpdated(Date.now());
    } catch (err: unknown) {
      console.error(err);
      let msg = "Unknown error";
      if (typeof err === "string") {
        msg = err;
      } else if (err instanceof Error) {
        msg = err.message;
      } else if (err && typeof err === "object" && "message" in err && typeof (err as Record<string, unknown>).message === "string") {
        msg = (err as Record<string, unknown>).message as string;
      } else {
        msg = String(err);
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchEvents();
  }, [fetchEvents]);

  const clearEvents = async () => {
    try {
      const app = (window as unknown as { __zerithApp?: SimpleApp }).__zerithApp;
      if (!app) return;
      if (typeof app.db("navEvents").clearAll === "function") {
        await app.db("navEvents").clearAll!();
      } else {
        // Fallback: delete each event if API doesn't support clearAll
        const ev = await app.db("navEvents").find({});
        if (ev.length) {
          // try bulk delete via clearAll isn't available; skip for simplicity
        }
      }
      await fetchEvents();
    } catch (err) {
      console.error(err);
    }
  };

  const exportCSV = () => {
    if (!events) return;
    const rows = ["_id,from,to,timestamp,sessionId"];
    for (const e of events) {
      rows.push(
        `${e._id ?? ""},"${(e.from ?? "").replace(/"/g, '""')}","${(e.to ?? "").replace(/"/g, '""')}",${e.timestamp ?? ""},${e.sessionId ?? ""}`
      );
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "navEvents.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const trainMarkov = () => {
    if (!transitions) return;
    setIsTraining(true);
    window.requestAnimationFrame(() => {
      const probs: Record<string, Record<string, number>> = {};
      for (const from of Object.keys(transitions)) {
        const row = transitions[from];
        const total = Object.values(row).reduce((s, v) => s + v, 0);
        probs[from] = {};
        for (const to of Object.keys(row)) {
          probs[from][to] = row[to] / total;
        }
      }
      setProbabilities(probs);
      setIsTraining(false);
    });
  };

  const predictNext = (state: string, top = 5) => {
    if (!probabilities) return [] as Array<{ to: string; p: number }>;
    const row = probabilities[state] ?? {};
    return Object.entries(row)
      .map(([to, p]) => ({ to, p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, top);
  };

  const transitionEntries = buildTransitionEntries();
  const topTransitions = [...transitionEntries].sort((a, b) => b.count - a.count).slice(0, 5);
  const routeStates = Array.from(new Set(transitionEntries.flatMap((entry) => [entry.from, entry.to])));
  const heatmapStates = routeStates.slice(0, 4);
  const heatmapRows = heatmapStates.map((from) => ({
    from,
    counts: heatmapStates.map((to) => transitions?.[from]?.[to] ?? 0),
  }));
  const stateOptions = Object.keys(probabilities ?? transitions ?? {});
  const predictionSource = currentState || stateOptions[0] || "";
  const predictions = predictionSource ? predictNext(predictionSource) : [];
  const eventCount = events?.length ?? 0;
  const routeCount = routeStates.length;
  const edgeCount = transitionEntries.length;
  const routeActivitySeries = routeStates.slice(0, 8).map((state) =>
    Object.values(transitions?.[state] ?? {}).reduce((sum, value) => sum + value, 0)
  );
  const routeActivityMax = Math.max(...routeActivitySeries, 1);
  const eventSparkline = events ? events.slice(0, 8).map((event) => Math.max(8, Math.min(34, 34 - Math.round((now - (event.timestamp ?? now)) / 120000)))) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950/5 via-slate-50 to-white text-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-[2rem] border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_90px_-52px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-slate-900">
                Live observability
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_8px_rgba(16,185,129,0.15)] animate-pulse" />
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="text-5xl font-semibold tracking-tight text-slate-950">ZerithDB route telemetry</h1>
                <p className="text-lg leading-8 text-slate-600 sm:text-xl">
                  Premium realtime analytics for distributed navigation, route prediction, and transition observability.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                <span>Realtime route telemetry</span>
                <span>•</span>
                <span>Markov prediction engine</span>
                <span>•</span>
                <span>Weighted transition heatmap</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                ← Back home
              </Link>
              <button
                onClick={() => void fetchEvents()}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4V1L8 5L12 9V6C16.4183 6 20 9.58172 20 14C20 15.2727 19.6685 16.4672 19.086 17.533" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4.91394 6.46603C3.33171 8.99689 3.21481 12.0665 4.61524 14.6844C6.01567 17.3023 8.7776 18.9208 12 18.9208C14.4695 18.9208 16.6863 17.9494 18.2176 16.3833" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {isLoading ? "Refreshing…" : "Refresh events"}
              </button>
              <button
                onClick={() => exportCSV()}
                disabled={!events || events.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-700" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 17V7C4 5.89543 4.89543 5 6 5H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 5V19C16 20.1046 15.1046 21 14 21H6C4.89543 21 4 20.1046 4 19V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18 11L22 15L18 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 15H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Export CSV
              </button>
              <button
                onClick={() => trainMarkov()}
                disabled={isTraining || !transitions}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition duration-200 hover:from-slate-800 hover:to-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 2L3 4L12 9L11 22L21 10L14 10L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {isTraining ? "Training…" : "Train Markov"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-[1.75rem] border border-red-200 bg-red-50/90 px-6 py-4 text-sm text-red-700 shadow-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="grid gap-6">
            <section className="rounded-[2rem] border border-slate-200/80 bg-slate-950/5 p-6 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Overview</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Realtime route activity</h2>
                </div>
                <div className="rounded-full bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200/80">
                  {lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : "Waiting for first sync..."}
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)]">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Events</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{eventCount}</p>
                </div>
                <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)]">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Unique routes</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{routeCount}</p>
                </div>
                <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)]">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Transitions</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{edgeCount}</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="rounded-[1.75rem] border border-slate-200/80 bg-slate-950/5 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Route heatmap</p>
                      <p className="mt-1 text-sm text-slate-600">Directional route density at a glance.</p>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                      Node matrix
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-[1.5rem] bg-slate-900/5 p-4">
                    {heatmapRows.length === 0 ? (
                      <div className="rounded-3xl bg-slate-100 p-4 text-sm text-slate-500">Heatmap unavailable until transitions exist.</div>
                    ) : (
                      <div className="grid gap-2 min-w-max" style={{ gridTemplateColumns: `auto repeat(${heatmapStates.length}, 1fr)` }}>
                        <div className="py-3 text-xs font-semibold text-slate-500"></div>
                        {heatmapStates.map((to) => (
                          <div key={to} className="w-16 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 text-center">{to}</div>
                        ))}
                        {heatmapRows.map((row) => (
                          <React.Fragment key={row.from}>
                            <div className="py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 whitespace-nowrap">{row.from}</div>
                            {row.counts.map((count, idx) => {
                              const opacity = count === 0 ? 0.12 : Math.min(1, 0.18 + count / (topTransitions[0]?.count ?? 1));
                              return (
                                <div key={`${row.from}-${heatmapStates[idx]}`} className="w-16 h-12 rounded-2xl bg-cyan-500 flex items-center justify-center" style={{ opacity }}>
                                  <span className="text-[11px] font-semibold text-white">{count}</span>
                                </div>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.20em] text-slate-500">Latest events</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">Live navigation stream</h3>
                </div>
                <button
                  type="button"
                  onClick={() => void clearEvents()}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-700" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3H15L16 5H8L9 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 7H18L17 19H7L6 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Clear events
                </button>
              </div>

              <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 shadow-sm">
                {!events ? (
                  <div className="p-8 text-center text-sm text-slate-500">Loading events…</div>
                ) : events.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No navigation activity yet. Interact with the app to populate events.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 border-b border-slate-200 bg-white/95 backdrop-blur">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Event</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Route</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Age</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.slice(0, 8).map((event, idx) => (
                          <tr key={event._id ?? idx} className="border-b border-slate-200 bg-white transition hover:bg-slate-50">
                            <td className="px-4 py-4 font-medium text-slate-900">{event.from ?? "<root>"} → {event.to ?? "<unknown>"}</td>
                            <td className="px-4 py-4 text-slate-600">{event.to}</td>
                            <td className="px-4 py-4 text-slate-600">{event.sessionId ?? "—"}</td>
                            <td className="px-4 py-4 text-slate-600">{event.timestamp ? formatRelativeTime(event.timestamp) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6">
            <section className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.20em] text-slate-500">Probability console</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">Next-route forecast</h3>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.20em] text-slate-600">
                  {probabilities ? "Model ready" : "Awaiting training"}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Choose a state</label>
                  <select
                    value={currentState}
                    onChange={(e) => setCurrentState(e.target.value)}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select a state</option>
                    {stateOptions.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
                  {probabilities ? (
                    predictionSource ? (
                      <div className="space-y-3">
                        {predictions.length === 0 ? (
                          <div className="text-sm text-slate-500">No outgoing transitions for this state.</div>
                        ) : (
                          predictions.map((prediction) => (
                            <div key={prediction.to} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-28px_rgba(15,23,42,0.16)]">
                              <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                                <span className="font-medium text-slate-900">{prediction.to}</span>
                                <span className="font-semibold text-slate-900">{(prediction.p * 100).toFixed(1)}%</span>
                              </div>
                              <div className="mt-2 h-2 rounded-full bg-slate-200">
                                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500" style={{ width: `${Math.max(6, prediction.p * 100)}%` }} />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">Select a state to reveal the next-route probabilities.</div>
                    )
                  ) : (
                    <div className="text-sm text-slate-500">Train the model to unlock probability predictions.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.20em] text-slate-500">Route activity</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">Traffic sparkline</h3>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.20em] text-slate-600">
                  {routeActivitySeries.length} routes
                </div>
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <p className="text-sm text-slate-600">Recent route activity intensity</p>
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Live trend</span>
                </div>

                <div className="space-y-3">
                  {routeActivitySeries.length === 0 ? (
                    <div className="rounded-3xl bg-slate-100 p-4 text-sm text-slate-500">Awaiting route activity…</div>
                  ) : (
                    routeActivitySeries.map((value, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">{routeStates[index] ?? "—"}</span>
                          <span className="text-xs font-semibold text-slate-500">{Math.round((value / routeActivityMax) * 100)}%</span>
                        </div>
                        <div className="h-8 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500" style={{ width: `${Math.max(8, (value / routeActivityMax) * 100)}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Event cadence</p>
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Recent 8</span>
                </div>
                <div className="flex items-end justify-between gap-1.5 h-16">
                  {eventSparkline.length === 0 ? (
                    <div className="flex-1 rounded-3xl bg-slate-100 p-4 text-sm text-slate-500">Waiting for event stream…</div>
                  ) : (
                    eventSparkline.map((height, idx) => (
                      <div key={idx} className="flex-1 rounded-t-lg bg-gradient-to-t from-emerald-500 to-cyan-400 transition-all duration-200 min-h-1" style={{ height: `${Math.max(8, height)}px` }} />
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
