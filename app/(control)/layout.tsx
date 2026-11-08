import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";

// One shared shell: loading, errors and sibling navigation replace content only.
export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentOperatorSession();
  if (!session) redirect("/login");
  return <AppShell operator={session.operator}>{children}</AppShell>;
}
