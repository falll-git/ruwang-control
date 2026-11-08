"use client";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="id"><body><main className="global-error"><h1>Aplikasi tidak dapat dibuka</h1><p>Muat ulang setelah layanan tersedia.</p><button type="button" onClick={reset}>Coba lagi</button></main></body></html>;
}
