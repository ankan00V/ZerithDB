import { useState, useEffect } from "react";
import { db } from "../db";
import { getPublicKey } from "../auth";
import type { Note } from "../db";
import { v4 as uuid } from "uuid";

interface Props {
  note: Note | null; // null = new note mode
  onSaved: (id: string) => void;
}

// ---------------------------------------------------------------------------
// NoteEditor
// ---------------------------------------------------------------------------
// All writes go to the local CRDT store first and are immediately visible.
//
// When offline:
//   The write is queued as a Yjs CRDT patch in IndexedDB.
//   The UI reflects the change instantly — no spinner, no error.
//
// When connectivity is restored:
//   zerithdb-sync replays queued patches to connected peers.
//   Yjs merges concurrent edits automatically; no conflict UI needed.

export function NoteEditor({ note, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate fields whenever the selected note changes.
  useEffect(() => {
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
  }, [note?.id]);

  async function handleSave() {
    setSaving(true);
    try {
      const now = Date.now();

      if (note) {
        // UPDATE — merges via CRDT; concurrent edits from peers are reconciled
        // by Yjs without any data loss or manual conflict resolution.
        await db.db("notes").update({ id: note.id }, { title, body, updatedAt: now });
        onSaved(note.id);
      } else {
        // INSERT — immediately persisted to local IndexedDB,
        // then queued for P2P sync when peers are reachable.
        const id = uuid();
        await db.db("notes").insert({
          id,
          title,
          body,
          tags: [],
          updatedAt: now,
          authorKey: getPublicKey(),
        } satisfies Note);
        onSaved(id);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!note) return;
    await db.db("notes").delete({ id: note.id });
    onSaved("");
  }

  return (
    <div className="note-editor">
      <input
        className="editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title…"
      />

      <textarea
        className="editor-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write something…"
        rows={24}
      />

      <div className="editor-actions">
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>

        {note && (
          <button className="btn-delete" onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
