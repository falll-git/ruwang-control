"use client";
import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("control_page_error", { digest: error.digest }); }, [error]);
  return <><section className="fatal-state"><CircleAlert aria-hidden="true" size={26} /><h1>Halaman tidak dapat dimuat</h1><p>Tidak ada data yang diganti dengan contoh. Coba ulangi permintaan atau periksa layanan.</p><Button onClick={reset}><RotateCcw aria-hidden="true" size={18} />Coba lagi</Button></section></>;
}
