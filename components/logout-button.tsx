"use client";

import { useId, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorId = useId();
  const router = useRouter();
  const lock = useRef(false);
  async function logout() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    let sent = false;
    let rejected = false;
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const csrfBody = await csrfResponse.json();
      if (!csrfResponse.ok) throw new Error("SESSION");
      sent = true;
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfBody.data.token },
        body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) { rejected = true; throw new Error("LOGOUT"); }
      router.push("/login");
      router.refresh();
    } catch {
      setError(sent && !rejected ? "Sesi belum bisa dipastikan tertutup. Muat ulang halaman." : "Keluar gagal. Muat ulang lalu coba kembali.");
      setBusy(false);
      lock.current = false;
    }
  }
  return <div className="logout-control"><button className="logout-btn" type="button" onClick={logout} disabled={busy} aria-label={busy ? "Sedang keluar" : "Keluar"} title="Keluar" aria-describedby={error ? errorId : undefined}>
    <span className="sign"><LogOut aria-hidden="true" size={20} /></span><span className="logout-text">{busy ? "Keluar…" : "Keluar"}</span>
  </button>{error ? <span id={errorId} role="alert">{error}</span> : null}</div>;
}
