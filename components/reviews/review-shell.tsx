"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeControlPath } from "@/src/lib/control-navigation";
import { Activity, Bell, CalendarDays, ClipboardCheck, Clock, LayoutDashboard, Menu, UserCog } from "lucide-react";
import { LogoutButton } from "../logout-button";
import { ReviewDialog } from "./review-dialog";
import { reviewPageSchema } from "@/src/domain/review-read-contract";
import { readReviewResponse } from "./review-request";
import { Button } from "@/components/ui/button";

// Arsip DashboardLayoutContent/SidebarMenu geometry; Control routes and palette.
const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reviews", label: "Pemeriksaan", icon: ClipboardCheck },
  { href: "/monitoring", label: "Monitoring SJ", icon: Activity },
  { href: "/operators", label: "Operator Control", icon: UserCog },
];
function Navigation({ onNavigate, activePath }: { onNavigate?: () => void; activePath: string | null }) {
  return <nav aria-label="Navigasi utama" className="control-navigation sidebar-nav">
    {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} {...(onNavigate ? {onClick:onNavigate} : {})}
      className={`sidebar-menu-item${href === activePath ? " active" : ""}`} aria-current={href === activePath ? "page" : undefined}>
      <Icon aria-hidden="true" size={20} /><span>{label}</span>
    </Link>)}
  </nav>;
}
function LocalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setNow(new Date()); tick(); const id = setInterval(tick, 60000); return () => clearInterval(id); }, []);
  const time = now ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).replace('.', ':') : "—";
  const date = now ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(now) : "—";
  return <div className="control-clock" aria-label={now ? `${date}, ${time}` : "Memuat waktu"}>
    <Clock size={16} aria-hidden="true" /><span>{time}</span><span className="control-clock-date"><CalendarDays size={16} aria-hidden="true" />{date}</span>
  </div>;
}
function WorkNotifications() {
  const [counts, setCounts] = useState<[number, number] | null>(null), [error, setError] = useState(false), [reload, setReload] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(["content", "lifecycle"].map(group => fetch(`/api/reviews?group=${group}&state=IN_REVIEW&limit=1`, {
      cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    }).then(r => readReviewResponse(r, reviewPageSchema))))
      .then(pages => { if (!controller.signal.aborted) { setCounts([pages[0]!.count.value, pages[1]!.count.value]); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [reload]);
  // Notification.tsx panel pattern. Scoped work counts, not an unread feed.
  return <section id="control-notifications" className="notif-panel" role="dialog" aria-labelledby="work-notifications-title">
    <header className="notif-panel-header"><div><h2 ref={title} tabIndex={-1} id="work-notifications-title" className="notif-title">Notifikasi</h2><p className="notif-subtitle">Pengajuan menunggu pemeriksaan</p></div></header>
    <div className="notif-list">{error ? <div role="alert" className="control-notification-error"><p>Jumlah pengajuan belum dapat dimuat.</p><Button variant="secondary" onClick={() => { setError(false); setCounts(null); setReload(n => n + 1); }}>Refresh</Button></div>
      : counts ? <div className="control-notification-list">{["Pengajuan konten", "Penarikan & perubahan"].map((label, i) => <Link key={label} prefetch={false}
        href={`/reviews?group=${i === 0 ? 'content' : 'lifecycle'}&state=IN_REVIEW`} className="notif-item">
        <span className="notif-icon-wrap"><ClipboardCheck aria-hidden="true" size={18} /></span><span>{label}<small>Buka daftar pengajuan</small></span><strong>{counts[i]}</strong>
      </Link>)}</div> : <p role="status">Memuat pengajuan…</p>}</div>
  </section>;
}
export function ReviewShell({ children, operator }: { children: ReactNode; operator?: { displayName: string; username: string } | undefined }) {
  const [open, setOpen] = useState(false), [collapsed, setCollapsed] = useState(false), [notifications, setNotifications] = useState(false);
  const notificationRoot = useRef<HTMLDivElement>(null), bell = useRef<HTMLButtonElement>(null);
  const pathname = usePathname(), activePath = activeControlPath(pathname), previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) { previousPath.current = pathname; document.getElementById("main-content")?.focus(); }
  }, [pathname]);
  useEffect(() => {
    if (!notifications) return;
    const outside = (event: Event) => { if (event.target instanceof Node && !notificationRoot.current?.contains(event.target)) setNotifications(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setNotifications(false); bell.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape); };
  }, [notifications]);
  const current = pathname.startsWith('/reviews/') ? 'Detail pengajuan' : pathname === '/monitoring/pengiriman' ? 'Pengiriman bank' : pathname === '/monitoring/pemrosesan' ? 'Pemrosesan SJ' : navigation.find(n => n.href === activePath)?.label || 'Halaman';
  const sidebar = (mobile = false) => <>
    {!mobile ? <div className="control-brand"><strong>RuwangControl</strong></div> : null}
    <Navigation activePath={activePath} {...(mobile ? { onNavigate: () => setOpen(false) } : {})} />
    {operator ? <div className="control-sidebar-footer"><div className="control-account"><div className="control-avatar" aria-hidden="true">{operator.displayName.slice(0, 1).toUpperCase()}</div>
      <span className="control-identity"><strong title={operator.displayName}>{operator.displayName}</strong><small>@{operator.username}</small></span></div><LogoutButton /></div> : null}
  </>;
  return <div className={`control-shell${collapsed ? ' is-collapsed' : ''}`}>
    <aside className="control-sidebar" inert={collapsed} aria-hidden={collapsed}>{sidebar()}</aside>
    <div className="control-workspace"><header className="control-topbar">
      <button className="control-icon control-desktop-toggle" aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'} aria-pressed={!collapsed} onClick={() => setCollapsed(v => !v)}><Menu size={24} aria-hidden="true" /></button>
      <button className="control-icon control-mobile-toggle" aria-label="Buka navigasi" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={24} aria-hidden="true" /></button>
      <nav className="control-breadcrumb" aria-label="Breadcrumb"><Link href="/" prefetch={false}>Dashboard</Link>{pathname !== '/' ? <><span aria-hidden="true">/</span><span aria-current="page" title={current}>{current}</span></> : null}</nav>
      <div className="control-header-actions"><div ref={notificationRoot} className="control-notifications" onClick={event => { if ((event.target as Element).closest('a')) setNotifications(false); }}>
        <button ref={bell} className="nav-notif-btn" aria-label="Buka notifikasi" aria-haspopup="dialog" aria-expanded={notifications} aria-controls={notifications ? "control-notifications" : undefined} onClick={() => setNotifications(v => !v)}><Bell className="nav-notif-bell" aria-hidden="true" /></button>
        {notifications ? <WorkNotifications /> : null}</div><LocalClock /></div>
    </header><main id="main-content" tabIndex={-1}>{children}</main></div>
    {open ? <ReviewDialog title="RuwangControl" className="control-navigation-dialog" onClose={() => setOpen(false)}><div className="control-mobile-sidebar">{sidebar(true)}</div></ReviewDialog> : null}
  </div>;
}
