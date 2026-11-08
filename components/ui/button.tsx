import type { ComponentPropsWithRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/src/lib/utils";

// Same button classes as Arsip SetupPrimaryButton/SetupViewButton.
// Slot preserves existing link callers; no second geometry/style system.
export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  asChild?: boolean;
};
export function Button({ className, variant = "primary", asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  const style = variant === "primary" ? "primary" : variant === "destructive" ? "danger" : "neutral";
  return <Component data-variant={variant} className={cn("uiverse-modal-button", "uiverse-modal-button--" + style, variant === "ghost" && "control-button-ghost", className)} {...props} />;
}
