import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <><div className="page-head" aria-busy="true" aria-label="Memuat halaman"><div><Skeleton className="h-9 w-48" /><Skeleton className="mt-3 h-6 w-[min(34rem,80vw)]" /></div></div><div className="metric-strip"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div><section className="section-block"><Skeleton className="h-7 w-52" /><Skeleton className="mt-6 h-40 w-full" /></section></>;
}
