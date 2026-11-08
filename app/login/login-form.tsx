"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { z } from "zod";

type ApiError = { error?: { message?: string } };
const loginReceipt = z.object({ data: z.object({ operator: z.object({ id: z.string().uuid(), username: z.string().min(3), displayName: z.string().min(1) }), expiresAt: z.string().datetime() }) });

export function LoginForm() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const alert = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    let rejected = false;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json() as ApiError;
      if (!response.ok) { rejected = true; throw new Error(body.error?.message ?? "Tidak dapat masuk."); }
      if (!loginReceipt.safeParse(body).success) throw new Error("INVALID_RESPONSE");
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(rejected && cause instanceof Error ? cause.message : "Hasil masuk belum dapat dipastikan. Muat ulang halaman.");
      setBusy(false);
      lock.current = false;
    }
  }

  return <form className="login-form" onSubmit={submit} aria-describedby={error ? "login-error" : undefined}>
    {error ? <div ref={alert} id="login-error" className="form-error" role="alert" tabIndex={-1}>{error}</div> : null}
    <label><span>Username</span><span className="login-input-field"><UserRound aria-hidden="true" size={18} /><input name="username" type="text" inputMode="text" autoComplete="username" minLength={3} maxLength={64} pattern={"[a-z0-9][a-z0-9._\\-]{2,63}"} spellCheck={false} autoCapitalize="none" placeholder="Masukkan username" required disabled={busy} /></span></label>
    <label><span>Password</span><span className="login-input-field password-field"><LockKeyhole aria-hidden="true" size={18} /><input name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" maxLength={128} placeholder="Masukkan password" required disabled={busy} /><button type="button" onClick={() => setPasswordVisible(value => !value)} aria-label={passwordVisible ? "Sembunyikan password" : "Tampilkan password"} disabled={busy}>{passwordVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}</button></span></label>
    <Button className="login-submit" type="submit" disabled={busy}>{busy ? "Memproses…" : "Masuk"}</Button>
  </form>;
}
