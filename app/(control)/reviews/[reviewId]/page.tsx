import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReviewDetail } from "@/components/reviews/review-detail";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";
import { getReviewDetail } from "@/src/server/reviews";
import { reviewDetailReadSchema } from "@/src/domain/review-read-contract";
import { safeReviewReturn } from "@/src/domain/review-ui";
import "@/app/reviews/review.css";
export const dynamic = "force-dynamic";
export default async function ReviewDetailPage({params, searchParams}:{params:Promise<{reviewId:string}>;searchParams:Promise<{returnTo?:string}>}) {
  const session=await getCurrentOperatorSession(); if(!session)redirect("/login");
  const {reviewId}=await params, query=await searchParams;
  const returnTo=safeReviewReturn(typeof query.returnTo==="string"?query.returnTo:null);
  let review=null;
  try { if(z.string().uuid().safeParse(reviewId).success) { const result=await getReviewDetail(session.principal,reviewId); if(result)review=reviewDetailReadSchema.parse(result); } } catch { /* No snapshot or decision controls on unavailable data. */ }
  return <>{review?<ReviewDetail key={review.id} initial={review} returnTo={returnTo} operatorKey={session.operator.username}/>:<div className="sj-review"><h1>Pengajuan belum dapat dibuka</h1><p>Data tidak tersedia, tidak dapat diakses, atau gagal dimuat.</p><Link href={returnTo}>Kembali ke pemeriksaan</Link><p><a href={`/reviews/${encodeURIComponent(reviewId)}?returnTo=${encodeURIComponent(returnTo)}`}>Coba lagi</a></p></div>}</>;
}
