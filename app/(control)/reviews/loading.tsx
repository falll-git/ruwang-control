import "@/app/reviews/review.css";

export default function ReviewLoading() {
  return <><div className="sj-review" aria-busy="true"><h1>Pemeriksaan</h1><div className="sj-empty" role="status">Memuat pengajuan…<div className="sj-skeleton" /></div></div></>;
}
