import {redirect} from 'next/navigation';
import {DeliveryRecoveryClient} from '@/components/delivery-recovery-client';
import {getCurrentOperatorSession} from '@/src/server/auth/current-session';
import {authorize} from '@/src/domain/authorization';
import {query} from '@/src/server/database';
import "@/app/reviews/review.css";
import "@/app/monitoring/pengiriman/recovery.css";
export const dynamic='force-dynamic';
export default async function DeliveryRecoveryPage() {
  const session=await getCurrentOperatorSession();if(!session)redirect('/login');
  const ids=[...new Set(session.principal.grants.filter(g=>authorize(session.principal,'delivery.read',g.instanceId).allowed).map(g=>g.instanceId))];
  let instances:{id:string;name:string}[]=[],error='';
  try{if(ids.length)instances=[...await query<{id:string;name:string}>("SELECT id::text,display_name AS name FROM control.instances WHERE id=ANY($1::uuid[]) AND enabled=true AND review_authority='central' ORDER BY display_name,id",[ids])];}
  catch{error='Daftar bank belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.';}
  return <><DeliveryRecoveryClient instances={instances} initialError={error}/></>;
}
