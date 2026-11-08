"use client";
// Port of Arsip SetupModalCloseButton; only import/name adjusted.
import type { ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";
export function ModalCloseButton({ className = "", type = "button", title = "Tutup", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} disabled={disabled} className={`uiverse-modal-button uiverse-modal-button--neutral uiverse-modal-button--icon ${className}`.trim()}
    title={title} aria-label={props["aria-label"] ?? "Tutup modal"} {...props}><X className="h-4 w-4" aria-hidden="true" /></button>;
}
