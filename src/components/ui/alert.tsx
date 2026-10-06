import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-md border px-4 py-3 text-sm", {
  variants: {
    variant: {
      info: "border-primary/20 bg-primary/5 text-foreground",
      success: "border-success/30 bg-success/10 text-foreground",
      warning: "border-warning/40 bg-warning/10 text-foreground",
      destructive: "border-destructive/30 bg-destructive/5 text-destructive",
    },
  },
  defaultVariants: { variant: "info" },
});

export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
