import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let activeSession = false;
  try {
    activeSession = Boolean(await getCurrentOperatorSession());
  } catch { /* Form remains available; API returns the verified operational error. */ }
  if (activeSession) redirect("/");
  return <main id="main-content" className="login-page">
    <section className="login-brand-pane" aria-labelledby="control-brand">
      <div className="login-brand-lockup">
        <span className="login-brand-mark" aria-hidden="true">
          <Image className="login-brand-image" src="/branding/logo-ruwang-arsip.png" alt="" width={1536} height={1024} priority />
        </span>
        <div>
          <h1 id="control-brand">Ruwang Control</h1>
          <p>Pusat kendali operasional Ruwang</p>
        </div>
      </div>
    </section>

    <section className="login-form-pane" aria-labelledby="login-title">
      <div className="login-form-shell">
        <div className="login-copy">
          <h2 id="login-title">Masuk ke Ruwang Control</h2>
        </div>
        <LoginForm />
        <p className="login-copyright">&copy; {new Date().getFullYear()} Ruwang Control &middot; Ruwang Arsip</p>
      </div>
    </section>
  </main>;
}
