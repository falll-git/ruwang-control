import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ReviewList } from "@/components/reviews/review-list";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";
import "@/app/reviews/review.css";
export const dynamic = "force-dynamic";
export default async function ReviewsPage() {
  const session = await getCurrentOperatorSession(); if (!session) redirect("/login");
  return <><Suspense fallback={<p role="status">Memuat pemeriksaan…</p>}><ReviewList /></Suspense></>;
}
