// Adapted from shadcn/ui Radix Badge (MIT), retrieved 2026-10-05.
// Source and license: docs/design-system.md and vendor/shadcn-LICENSE.md.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

const badgeVariants = cva("control-badge", {
  variants: {
    variant: {
      default: "control-badge--default",
      secondary: "control-badge--secondary",
      destructive: "control-badge--destructive",
      outline: "control-badge--outline",
      ghost: "control-badge--ghost",
      link: "control-badge--link",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant = "default", asChild = false, ...props }:
  React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props}/>;
}

export function StatusBadge({ tone = "neutral", ...props }: React.ComponentProps<"span"> & {
  tone?: "neutral" | "pending" | "success" | "danger";
}) {
  return <Badge variant={tone === "danger" ? "destructive" : "secondary"} {...props}
    className={cn("control-badge--" + tone, props.className)}/>;
}

export { Badge, badgeVariants };
