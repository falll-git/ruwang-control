import type { ReactNode } from "react";
import { ReviewShell } from "@/components/reviews/review-shell";
export function AppShell({ children, operator }: { children: ReactNode; operator?: { displayName: string; username: string } }) {
  return <ReviewShell operator={operator}>{children}</ReviewShell>;
}
