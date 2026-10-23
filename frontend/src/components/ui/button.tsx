import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-brand-800 text-white hover:bg-brand-900 shadow-soft",
        gold: "bg-gold-500 text-ink-900 hover:bg-gold-400 shadow-soft",
        outline: "border border-brand-800/30 bg-white text-brand-900 hover:bg-brand-50",
        ghost: "text-brand-900 hover:bg-brand-50",
        danger: "bg-danger-600 text-white hover:bg-red-700",
        subtle: "bg-sand-100 text-ink-900 hover:bg-sand-200",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>;

export function LinkButton({ className, variant, size, ...props }: LinkButtonProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
