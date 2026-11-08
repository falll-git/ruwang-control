import { redirect } from "next/navigation";
import FeatureHeader from "@/components/ui/feature-header";
import { UserCog } from "lucide-react";
import { OperatorManagementClient } from "@/components/operator-management-client";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";
import { listManagedOperators } from "@/src/server/auth/service";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const session = await getCurrentOperatorSession();
  if (!session) redirect("/login");
  const directory = await listManagedOperators(session);
  return <>
    <FeatureHeader title="Operator Control" subtitle="Kelola akun internal Ruwang Control." icon={<UserCog/>}/>
    <OperatorManagementClient initial={directory} />
  </>;
}
