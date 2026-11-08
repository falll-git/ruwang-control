"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, RefreshCw } from "lucide-react";
import FeatureHeader from "@/components/ui/feature-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { reviewDetailReadSchema, type ReviewDetailResponse } from "@/src/domain/review-read-contract";
import { applicationLabels, bankSnapshotStateLabel, displayValue, reviewDate, reviewLabels } from "@/src/domain/review-ui";
import { ReviewDecisionForm } from "../review-decision-form";
import { ReviewMedia } from "./review-media";
import { readReviewResponse } from "./review-request";
import { attributeLabels, publicationAttributeValue } from "@/src/domain/publication-display";
import { reviewDecisionBadge } from "@/src/domain/review-presentation";

export function ReviewDetail({ initial, returnTo, operatorKey }: { initial: ReviewDetailResponse; returnTo: string; operatorKey: string }) {
  const [review,setReview]=useState(initial), [error,setError]=useState(""), [busy,setBusy]=useState(false);
  const [mediaRevision,setMediaRevision]=useState(0);
  const endpoint=`/api/instances/${review.instanceId}/reviews/${review.id}`;
  async function refresh() { setBusy(true);setError("");try { const data=await readReviewResponse(await fetch(endpoint,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)}),reviewDetailReadSchema);if(data.id!==review.id||data.instanceId!==review.instanceId)throw Error();setReview(data);setMediaRevision(v=>v+1);return true; } catch { setError("Pengajuan belum berhasil diperbarui. Data di bawah adalah hasil pemuatan sebelumnya.");return false; } finally {setBusy(false)} }
  const detail=review.detail;
  let fields: [string,unknown][]=[];
  if(detail.kind==="profile")fields=[["Nama publik",detail.public_name],["Alamat publik",detail.public_slug],["Kota/kabupaten",detail.city_regency],["Provinsi",detail.province],["Website",detail.website_url],["Deskripsi",detail.short_description]];
  if(detail.kind==="contact")fields=[["Nama kontak",detail.label],["Nomor WhatsApp",detail.phone_e164],["Versi templat pesan",detail.message_template_version]];
  if(detail.kind==="publication")fields=[["Referensi",detail.reference_code],["Kategori",reviewLabels[detail.category]||detail.category],["Subkategori",detail.subcategory],["Lokasi",`${detail.city_regency}, ${detail.province}`],["Ketersediaan",reviewLabels[detail.availability]||detail.availability],["Deskripsi",detail.description],["BPRS",detail.profile.public_name],["Kontak",`${detail.contact.label} · ${detail.contact.phone_e164}`],...Object.entries(detail.attributes).map(([k,v]):[string,unknown]=>[attributeLabels[k]??k,publicationAttributeValue(v)])];
  // Legacy central_synced is an aggregate/media-ID marker, not a delivery ACK.
  // Keep it in the immutable signed contract, but do not display a success claim.
  if(detail.kind==="change_request")fields=[["Permintaan",reviewLabels[detail.action]],["Data terkait",detail.target_label],["Status saat diajukan",bankSnapshotStateLabel(detail.current_state)],["Alasan bank",detail.reason],["Publikasi terdampak",detail.affected_publications],["Media terdampak",detail.affected_media]];
  const media=detail.kind==="profile"?[detail.logo]:detail.kind==="contact"?[]:detail.media;
  return <div className="sj-review sj-review-detail"><Link prefetch={false} className="sj-back" href={returnTo}><ArrowLeft size={18} aria-hidden="true"/>{returnTo.startsWith("/monitoring") ? "Kembali ke monitoring" : "Kembali ke pemeriksaan"}</Link>
    <FeatureHeader title={review.title} subtitle={`${review.instanceName} · ${reviewLabels[review.kind]} · Versi ${review.sourceVersion} · ${reviewDate(review.submittedAt)}`} icon={<ClipboardCheck/>} actions={<><StatusBadge tone={reviewDecisionBadge(review).tone}>{reviewDecisionBadge(review).label}</StatusBadge><Button variant="secondary" disabled={busy} onClick={refresh}><RefreshCw size={16} aria-hidden="true" className={busy?"control-spin":undefined}/>Refresh</Button></>}/>
    {error?<p role="alert" className="sj-error">{error}</p>:null}
    {review.versions.latestReceived.version>review.sourceVersion?<p className="sj-context">Pengajuan ini sudah digantikan versi {review.versions.latestReceived.version}. <Link prefetch={false} href={`/reviews/${review.versions.latestReceived.id}?returnTo=${encodeURIComponent(returnTo)}`}>Buka versi terbaru</Link></p>:null}
    <div className="sj-detail-grid"><section className="sj-document"><header><h2>Data yang diajukan</h2><span>Versi {review.sourceVersion}</span></header><div className="sj-document-body"><dl className="sj-record">{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd data-long={label === "Deskripsi" || label === "Alasan bank" || displayValue(value).length > 160}>{displayValue(value)}</dd></div>)}</dl>
      {detail.kind!=="contact"?<ReviewMedia key={`${review.id}:${mediaRevision}`} media={media} instanceId={review.instanceId} reviewId={review.id}/>:null}
      {detail.kind==="change_request"&&detail.blockers.length?<div className="sj-context"><h3>Kendala pada pengajuan</h3><ul>{detail.blockers.map(item=><li key={item}>{item}</li>)}</ul></div>:null}
    </div></section><ReviewDecisionForm key={review.id} review={review} operatorKey={operatorKey} onRefresh={refresh}/></div>
    {review.commandState&&!review.decision?<p className="sj-secondary">Penerapan keputusan: {applicationLabels[review.commandState]}.</p>:null}
  </div>;
}
