"use client";
import { SetupDataTable, SetupDataTableHead, SetupDataTableBody, SetupDataTableRow, SetupDataTableHeaderCell, SetupDataTableCell } from "@/components/ui/data-table";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Plus, UserRound } from "lucide-react";
import { z } from "zod";
import SetupEmptyState from "@/components/ui/empty-state";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ManagedOperator } from "@/src/server/auth/service";
import { StatusBadge } from "@/components/ui/badge";
import {ReviewDialog} from "@/components/reviews/review-dialog";

type Props = { initial: { operators: ManagedOperator[] } };
type ApiError = { error?: { code?: string; message?: string } };
const accountReceipt = z.object({ id:z.string().uuid(), username:z.string() }).strict();


export function OperatorManagementClient({ initial }: Props) {
  const router = useRouter();
  const passwordId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false), formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); setVisible(false); };
  useEffect(()=>{if(open)formRef.current?.querySelector<HTMLInputElement>('input')?.focus();},[open]);
  useEffect(()=>{if(!busy && usernameError)formRef.current?.querySelector<HTMLInputElement>('[name="username"]')?.focus();else if(error)errorRef.current?.focus();},[error,usernameError,busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uncertain) return;
    submitting.current = true;
    setBusy(true); setError("");setUsernameError("");
    const element = event.currentTarget;
    const form = new FormData(element);

    let sent=false, rejected=false;
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store", signal:AbortSignal.timeout(10000) });
      const csrfBody = await csrfResponse.json() as { data?: { token?: string }; error?: { message?: string } };
      if (!csrfResponse.ok || !csrfBody.data?.token) throw new Error(csrfBody.error?.message ?? "Sesi keamanan tidak tersedia.");
      sent=true;
      const response = await fetch("/api/operators", {
        method: "POST",
        signal:AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfBody.data.token },
        body: JSON.stringify({ username: form.get("username"), displayName: form.get("displayName"),
          password: form.get("password") }),
      });
      rejected=!response.ok && response.status<500;
      const body = await response.json() as ApiError & {data?:unknown};
      if(response.status===409 && body.error?.code==="USERNAME_ALREADY_EXISTS") {
        setUsernameError("Username sudah digunakan. Pilih username lain.");return;
      }
      if (!response.ok) throw new Error(body.error?.message ?? "Akun belum dapat dibuat.");
      const receipt=accountReceipt.safeParse(body.data);
      if(!receipt.success || receipt.data.username!==String(form.get("username")).trim().toLowerCase())throw new Error("Hasil pembuatan akun belum dapat dipastikan.");
      element.reset();
      close();
      router.refresh();
    } catch (cause) {
      if(sent&&!rejected){setUncertain(true);setError("Hasil pembuatan akun belum pasti. Periksa daftar akun sebelum mencoba kembali.");}
      else setError(cause instanceof Error ? cause.message : "Akun belum dapat dibuat.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <div className="operator-layout">
    <section className="section-block operator-directory" aria-labelledby="operator-list-title">
      <div className="section-heading"><h2 id="operator-list-title">Akun operator</h2><Button onClick={() => {setError("");setUsernameError("");setUncertain(false);setOpen(true);}} disabled={busy}><Plus aria-hidden="true" size={18} />Buat akun</Button></div>
      {initial.operators.length === 0 ? <SetupEmptyState title="Belum ada akun operator" icon={UserRound}/>
        : <SetupDataTable className="control-data-table control-operator-table"><caption className="sr-only">Akun internal Ruwang Control</caption><SetupDataTableHead><SetupDataTableRow><SetupDataTableHeaderCell scope="col">Operator</SetupDataTableHeaderCell><SetupDataTableHeaderCell scope="col">Status</SetupDataTableHeaderCell></SetupDataTableRow></SetupDataTableHead><SetupDataTableBody>{initial.operators.map(operator => <SetupDataTableRow key={operator.id}>
          <SetupDataTableCell><div className="control-operator-identity"><span className="operator-avatar" aria-hidden="true">{operator.displayName.slice(0, 1).toUpperCase()}</span><span className="operator-identity"><strong>{operator.displayName}</strong><small>@{operator.username}</small></span></div></SetupDataTableCell>

          <SetupDataTableCell data-label="Status"><StatusBadge tone={operator.status === "active" ? "success" : "neutral"}>{operator.status === "active" ? "Aktif" : "Nonaktif"}</StatusBadge></SetupDataTableCell>
        </SetupDataTableRow>)}</SetupDataTableBody></SetupDataTable>}
    </section>

    {open ? <ReviewDialog title="Buat akun operator" onClose={close} busy={busy} footer={<><Button type="button" variant="secondary" onClick={close} disabled={busy}>Batal</Button>{uncertain?<Button type="button" onClick={()=>{close();router.refresh();}}>Periksa daftar akun</Button>:<Button form="create-operator-form" type="submit" disabled={busy}>{busy ? "Membuat akun…" : "Simpan akun"}</Button>}</>}>
      <form id="create-operator-form" ref={formRef} onSubmit={submit} className="operator-form" aria-busy={busy}>
        {error ? <div ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</div> : null}
        <div className="operator-form-grid">
          <label><span>Nama operator</span><input data-initial-focus name="displayName" minLength={2} maxLength={160} required disabled={busy} /></label>
          <label><span id={`${passwordId}-username-label`}>Username</span><input name="username" aria-labelledby={`${passwordId}-username-label`} minLength={3} maxLength={64} pattern={"[a-z0-9][a-z0-9._\\-]{2,63}"} autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={busy} aria-invalid={!!usernameError} aria-describedby={usernameError?`${passwordId}-username-error`:undefined} onChange={()=>setUsernameError("")}/>{usernameError?<small id={`${passwordId}-username-error`} className="sj-error" role="alert">{usernameError}</small>:null}</label>
          <label className="operator-password"><span id={`${passwordId}-label`}>Password</span><span className="password-field"><input name="password" aria-labelledby={`${passwordId}-label`} aria-describedby={`${passwordId}-help`} type={visible ? "text" : "password"} minLength={14} maxLength={128} autoComplete="new-password" required disabled={busy} /><button type="button" disabled={busy} onClick={() => setVisible(value => !value)} aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}>{visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}</button></span><small id={`${passwordId}-help`}>Minimal 14 karakter dan sedikitnya tiga jenis karakter.</small></label>

        </div>

      </form>
    </ReviewDialog> : null}
  </div>;
}
