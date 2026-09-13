"use client";
import { useEffect, useState } from "react";
import { EloChip } from "./EloChip";

interface CommentDto {
  id: string;
  body?: string;
  videoUrl?: string;
  createdAt: string;
  author: { profile?: { fullName?: string; handle?: string } };
  replies?: CommentDto[];
  _count?: { replies: number };
}

/** Comments on any post — videos included. Threaded, with 15s video replies. */
export function CommentThread({ postId }: { postId: string }) {
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/posts/${postId}/comments`).then((r) => r.json()).then(setComments).catch(() => {});
  }, [postId]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text.trim() }),
    });
    if (res.ok) {
      setComments([await res.json(), ...comments]);
      setText("");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(212,175,55,0.08)" }}>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Add a comment — notation welcome"
          className="flex-1 rounded-xl bg-night px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid rgba(212,175,55,0.08)" }}
        />
        <button onClick={send} disabled={busy} className="rounded-xl bg-gold px-3 text-sm font-semibold text-night">
          Reply
        </button>
      </div>
      {comments.map((c) => (
        <div key={c.id} className="cascade text-sm">
          <p className="text-ivory-meta text-xs">
            {c.author.profile?.fullName ?? "player"} · {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          {c.body && <p className="mt-0.5">{c.body}</p>}
          {c.videoUrl && (
            <video src={c.videoUrl} controls className="mt-1 max-h-40 rounded-xl" preload="metadata" />
          )}
          {(c.replies?.length ?? 0) > 0 && (
            <div className="mt-2 space-y-2 pl-4" style={{ borderLeft: "2px solid rgba(212,175,55,0.15)" }}>
              {c.replies!.map((r) => (
                <div key={r.id}>
                  <p className="text-ivory-meta text-xs">{r.author.profile?.fullName ?? "player"}</p>
                  <p>{r.body}</p>
                </div>
              ))}
              {(c._count?.replies ?? 0) > 3 && (
                <p className="text-xs text-gold">View all {c._count!.replies} replies</p>
              )}
            </div>
          )}
        </div>
      ))}
      {comments.length === 0 && <p className="text-xs text-ivory-meta">The board is set. Make the first comment.</p>}
    </div>
  );
}
