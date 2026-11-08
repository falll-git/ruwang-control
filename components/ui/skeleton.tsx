import { cn } from "@/src/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-md bg-surface-subtle", className)} />;
}
