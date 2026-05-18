import { useState, useEffect, useCallback } from "react";
import { db } from "../db";
import type { Note } from "../db";

// ---------------------------------------------------------------------------
// useNotes — custom live-query hook
// ---------------------------------------------------------------------------
// zerithdb-sdk doesn't export useQuery; we call the imperative API directly.
// Reactivity comes from two sources:
//   1. ZerithDB's own change/sync events (best-effort, alpha API)
//   2. A 2-second polling fallback so the list always stays fresh

function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await db.db("notes").find({});
      // Sort by updatedAt descending
      result.sort((a: Note, b: Note) => b.updatedAt - a.updatedAt);
      setNotes(result);
      setError(null);
    } catch (e) {
      setError("Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();

    // Re-fetch on ZerithDB sync/change events (alpha — may not fire yet)
    try {
      db.sync.on("synced", fetch);
      db.sync.on("change", fetch);
    } catch {
      /* noop */
    }

    // Polling fallback — keeps the list consistent even without events
    const interval = setInterval(fetch, 2000);

    return () => {
      clearInterval(interval);
      try {
        db.sync.off?.("synced", fetch);
        db.sync.off?.("change", fetch);
      } catch {
        /* noop */
      }
    };
  }, [fetch]);

  return { notes, loading, error };
}

// ---------------------------------------------------------------------------
// NoteList component
// ---------------------------------------------------------------------------

interface Props {
  onSelect: (note: Note) => void;
  selectedId: string | null;
}

export function NoteList({ onSelect, selectedId }: Props) {
  const { notes, loading, error } = useNotes();

  if (loading) return <p className="list-state">Loading…</p>;
  if (error) return <p className="list-state error">{error}</p>;
  if (!notes.length) return <p className="list-state muted">No notes yet.</p>;

  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li
          key={note.id}
          className={`note-item ${note.id === selectedId ? "active" : ""}`}
          onClick={() => onSelect(note)}
        >
          <span className="note-title">{note.title || "Untitled"}</span>
          <span className="note-date">{new Date(note.updatedAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}
