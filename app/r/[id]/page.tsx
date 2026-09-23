"use client";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/ui";

/** Private recovery link: /r/{roomId}#k={token}. The token lives in the fragment, so it never reaches server logs. */
export default function Recover({ params }: { params: { id: string } }) {
  const [msg, setMsg] = useState("Signing you back in…");
  useEffect(() => {
    const m = /#k=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) {
      setMsg("This private link is incomplete. Open the full link you saved, or ask the coordinator for the group link.");
      return;
    }
    (async () => {
      const r = await fetch(`/api/rooms/${params.id}/recover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: m[1] }) });
      const j = await r.json();
      if (!r.ok) return setMsg(j.error ?? "That link didn't work.");
      try {
        localStorage.setItem(`cg_recovery_${params.id}`, location.href);
      } catch {}
      location.replace(`/room/${params.id}`);
    })();
  }, [params.id]);
  return (
    <main className="mx-auto max-w-read px-4 py-16">
      <Wordmark />
      <p className="mt-10 text-lg" role="status">{msg}</p>
    </main>
  );
}
