"use client";
import { ModalCloseButton } from "@/components/ui/modal-close-button";
import { useEffect, useRef, type ReactNode } from "react";
export function ReviewDialog({ title, children, footer, onClose, busy = false, className = "" }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; busy?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!; const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={ref} className={`sj-dialog control-dialog ${className}`.trim()} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (busy || event.target !== ref.current) return;
    const bounds = ref.current!.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(el => el.getClientRects().length);
    if (!controls.length) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)!.focus(); }
    if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]!.focus(); }
  }}>
    <header><h2>{title}</h2><ModalCloseButton aria-label="Tutup dialog" disabled={busy} onClick={onClose}/></header>
    <div className="sj-dialog-body">{children}</div>{footer ? <footer>{footer}</footer> : null}
  </dialog>;
}
