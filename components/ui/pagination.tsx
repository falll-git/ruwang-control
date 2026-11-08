"use client";
// Port of Arsip src/components/ui/Pagination.tsx; same number input, arrows and
// page/total semantics. Control tokens replace Arsip's blue/gray color classes.
import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

const clampPage = (page: number, lastPage: number) => Math.min(Math.max(1, Math.trunc(page)), Math.max(1, lastPage));
export default function Pagination({ page, lastPage, total, limit, onPageChange, isLoading = false }: {
  page: number; lastPage: number; total?: number; limit?: number;
  onPageChange: (page: number) => void; isLoading?: boolean;
}) {
  const inputId = useId(), normalizedLastPage = Math.max(1, lastPage);
  const currentPage = clampPage(page, normalizedLastPage);
  const [draft, setDraft] = useState({page:currentPage,value:String(currentPage)});
  const draftPage=draft.page===currentPage?draft.value:String(currentPage);
  if(normalizedLastPage <= 1 && (!total || total <= (limit ?? total)))return null;
  function commitPage(value: string) {
    const parsed=Number(value), nextPage=clampPage(Number.isFinite(parsed)?parsed:currentPage,normalizedLastPage);
    setDraft({page:currentPage,value:String(nextPage)});
    if(nextPage!==currentPage)onPageChange(nextPage);
  }
  return <nav className="control-pagination" aria-label="Pagination">
    {typeof total==="number"&&typeof limit==="number"?<p>Total {total} data</p>:<span aria-hidden="true"/>}
    <ul><li><Button variant="secondary" type="button" disabled={currentPage<=1||isLoading} aria-label="Halaman sebelumnya" onClick={()=>onPageChange(currentPage-1)}><ChevronLeft size={16} aria-hidden="true"/></Button></li>
      <li><label htmlFor={inputId}><span className="sr-only">Halaman</span><input id={inputId} type="number" min={1} max={normalizedLastPage} value={draftPage} disabled={isLoading}
        onChange={event=>setDraft({page:currentPage,value:event.target.value})} onBlur={event=>commitPage(event.target.value)}
        onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></label></li>
      <li><Button variant="secondary" type="button" disabled={currentPage>=normalizedLastPage||isLoading} aria-label="Halaman berikutnya" onClick={()=>onPageChange(currentPage+1)}><ChevronRight size={16} aria-hidden="true"/></Button></li></ul>
    <p>Halaman {currentPage} dari {normalizedLastPage}</p>
  </nav>;
}
