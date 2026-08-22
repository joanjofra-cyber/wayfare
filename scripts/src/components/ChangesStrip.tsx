"use client";

import { useEffect, useState } from "react";

interface Entry {
  id: string;
  summary: string;
  actor: string | null;
  at: string;
}

/**
 * "3 changes since you last looked."
 *
 * With no accounts there is no server-side record of who looked when, so the
 * last-seen time lives in this browser. Per-device rather than per-person,
 * which in practice is the same thing and needs no extra table.
 */
export default function ChangesStrip({
  projectId,
  changes,
}: {
  projectId: string;
  changes: Entry[];
}) {
  const key = `wayfare:lastseen:${projectId}`;
  const [since, setSince] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setSince(localStorage.getItem(key));
    } catch {
      // Private windows and blocked storage: just show nothing.
    }
    setReady(true);
  }, [key]);

  function markSeen() {
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setOpen(false);
    setSince(new Date().toISOString());
  }

  if (!ready || !since) {
    // First visit on this device — nothing to compare against yet.
    if (ready && !since) {
      try {
        localStorage.setItem(key, new Date().toISOString());
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  const fresh = changes.filter((c) => c.at > since);
  if (fresh.length === 0) return null;

  return (
    <div>
      <button
        className="changes-strip"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", cursor: "pointer", font: "inherit", textAlign: "left" }}
      >
        <span>
          {fresh.length} {fresh.length === 1 ? "change" : "changes"} since you last looked
        </span>
        <span className="spacer" />
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="card-quiet" style={{ marginBottom: "1rem" }}>
          <div className="stack-sm">
            {fresh.map((c) => (
              <div key={c.id} className="small">
                {c.actor ? <strong>{c.actor}</strong> : <strong>Someone</strong>} — {c.summary}
              </div>
            ))}
          </div>
          <button className="btn btn-sm" onClick={markSeen} style={{ marginTop: "0.75rem" }}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
