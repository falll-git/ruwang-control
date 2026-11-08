import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <AppShell><section className="fatal-state"><p className="error-code">404</p><h1>Halaman tidak ditemukan</h1><p>Alamat ini belum menjadi bagian dari Ruwang Control.</p><Button asChild><Link href="/">Kembali ke dashboard</Link></Button></section></AppShell>; }
