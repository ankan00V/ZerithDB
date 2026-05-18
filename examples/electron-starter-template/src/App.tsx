import { useState } from "react";
import { NoteList } from "./components/NoteList";
import { NoteEditor } from "./components/NoteEditor";
import { SyncStatus } from "./components/SyncStatus";
import type { Note } from "./db";

export function App() {
  // null  → "new note" mode (editor is blank)
  // Note  → editing an existing note
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  function handleSaved(id: string) {
    // After inserting a new note we want to keep the editor open on that note.
    // useQuery will have already updated the list; we just need the id to
    // re-select it. In a real app you'd query by id here.
    console.log("[app] note saved:", id);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <SyncStatus />

        <button className="btn-new" onClick={() => setSelectedNote(null)}>
          ＋ New Note
        </button>

        <NoteList onSelect={setSelectedNote} selectedId={selectedNote?.id ?? null} />
      </aside>

      <main className="editor-pane">
        <NoteEditor note={selectedNote} onSaved={handleSaved} />
      </main>
    </div>
  );
}
