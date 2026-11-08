import "@fontsource-variable/inter";
import "./globals.css";
import "./reviews/review.css";
import "./arsip-button.css";
import "./arsip-table.css";
import "./control-ui.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Ruwang Control", template: "%s · Ruwang Control" },
  description: "Kontrol pemeriksaan dan pipeline Seputar Jaminan.",
  icons: { icon: "/branding/logo-ruwang-arsip-small.webp" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><a className="skip-link" href="#main-content">Lewati ke konten utama</a>{children}</body></html>;
}
